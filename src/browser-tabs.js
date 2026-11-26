'use strict';
/**
 * TABS — WHOSE TAB IS THIS, AND WHO MAY SWITCH TO IT OR CLOSE IT (lane browser-resume chunk C, the owner's ruling 3 of
 * 2026-09-30: "目前浏览器似乎没有完善的关闭标签页能力"). PURE: imports only peer-text (THE belt — verify r1 F8); CJS so the keeper, the routes, the live-view
 * bridge and the bundle share ONE spelling of every rule and every sentence. docs/design-agent-browser-v2.zh.md §3.9.
 *
 * MEASURED on the real agent-browser 0.38.1 + Chrome 154 (lane browser-resume C, 2026-09-30):
 *   · a session over a shared Chrome's CDP url gets its OWN new tab at its first command (`open`, and even `tab list`) —
 *     never an existing one; `tab list --json` under ANY session lists EVERY page of the Chrome (`chrome://newtab` aside),
 *     `active` = that session's bound tab; `t<N>` ids are the daemon's (one numbering for every session of a namespace);
 *   · `tab new [url] --json` answers `{tabId, targetId}` and makes the new tab the session's active one — a tab it opens
 *     has NO opener; a page's popup (`target=_blank`, window.open) names the tab that opened it (`openerId`) and does not
 *     become active;
 *   · `tab <targetId>` switches; `tab close <targetId>` closes ANY tab of the Chrome, another session's included (the
 *     binary checks nothing) — that session's next command answers `tab_gone` (with --pin-tab), `tab list` still lists and
 *     never re-binds; `tab close` with no ref closes the session's current tab (its next command: `tab_gone`);
 *   · the stream server's `tabs` record (per session) lists EVERY page too, `active` = that session's tab.
 * So the binary is no fence: on a SHARED profile's one Chrome the agent's `tab list` would name the user's own tab and
 * another conversation's pages, and its `tab close <ref>` would close them. THE FENCE IS HERE:
 *
 *   OWNERSHIP (`tabOwners`) — ONE CDP read (Target.getTargets: `{targetId, type, openerId}`) + the HOLDERS of the browser:
 *     each holder = `{key, roots, active}` — `roots` = the tabs it provably opened (its lease's tab bound by the keeper, a
 *     `tab new` it ran through the server, the user's own tab + the orphans he took), `active` = its session's current
 *     tab when known (weaker than any root: taken only when no holder roots it). Then every tab a holder's tab OPENED,
 *     transitively (the popup rule browse-yourself measured). What nobody holds is `orphan`. A conversation's OWN browser
 *     (`ephemeralKey`) is its alone: every page is its. The holders are ordered — the user first: his tab is never a
 *     conversation's.
 *   THE AGENT (`agentTabView` / `agentTabVerdict`) — lists, switches to and closes ITS OWN tabs only: another holder's
 *     title and URL are that holder's page content (a count only — "N other tabs are not yours"); a ref to one is
 *     `not_your_tab`; an unreadable browser fails CLOSED (`tabs_unreadable`); closing its current tab is allowed and SAID
 *     (its next page verb answers `tab_gone` until it switches or opens one — the binary's own rule).
 *   THE USER (`userTabVerdict` / `tabRowModel`) — the live view's tab row: his own tabs (`hu-`) switch / close always
 *     (never his last one: Close in his browsing window ends it); the agent's tabs only WHILE HE DRIVES it (a takeover —
 *     his switch / close is recorded on the takeover's cycle and SAID to the agent at the handback), never its last one,
 *     never on a "separate tabs" (mediated) browser in v1 (the proxy's paused fence refuses a lease's calls while he
 *     drives — no credit is minted for a tab act yet); another conversation's tab is never his to touch from here
 *     ("open its live view"); an orphan is his to take only from his browsing window when no conversation leases the
 *     browser (the orphan rule). The client draws ONLY the controls the verdict allows (no greyed control).
 */

const TARGET_ID_RE = /^[0-9A-Fa-f]{32}$/;
const TAB_ID_RE = /^t\d{1,5}$/;
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
/** The agent's four acts (the binary's own operations, measured). */
const AGENT_TAB_ACTS = Object.freeze(['list', 'new', 'switch', 'close']);
/** The user's two acts from the tab row. */
const USER_TAB_ACTS = Object.freeze(['switch', 'close', 'stop']);   // lane ui-needs-a-button: + the person's STOP (the loop banner's door)
/** Whose a tab is, from the VIEW's side: the viewed conversation's (`agent`), the user's own (`you`), another
 *  conversation's (`other`), nobody's (`orphan`). */
const OWNER_WORDS = Object.freeze(['agent', 'you', 'other', 'orphan']);
/** Every refusal a tab act can answer (the routes' STATUS rows and the census read this). */
const TAB_REFUSALS = Object.freeze(['not_your_tab', 'tabs_unreadable', 'no_such_tab', 'take_over_first', 'last_tab', 'mediated_tabs', 'not_web', 'bad-request', 'browser_unresponsive', 'stop_failed']); // lane browser-unresponsive: + the hung browser (after the verdict)
/** A holder's roots are bounded (the lease's registry row, persisted). */
const MAX_ROOTS = 32;
/** The takeover cycle keeps this many of the user's tab acts. */
const MAX_USER_ACTS = 16;
const TITLE_CHIP = 24;

const PT = require('./peer-text.js'); // verify r1 (F8): the ONE belt on a page's url before it reaches the agent
const str = (v) => (v == null ? '' : String(v));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m)); }
const tOf = (t) => (typeof t === 'function' ? (s, p) => t(s, p) : fill);
const isTargetId = (v) => TARGET_ID_RE.test(str(v));
const idKey = (v) => str(v).toUpperCase();

/** The page targets of a CDP Target.getTargets answer (targetInfos) — `{targetId, openerId}`, 32-hex ids only. */
function pageTargets(targets) {
  return (Array.isArray(targets) ? targets : []).filter((x) => isObj(x) && str(x.type || 'page') === 'page' && isTargetId(x.targetId))
    .map((x) => ({ targetId: idKey(x.targetId), openerId: isTargetId(x.openerId) ? idKey(x.openerId) : null }));
}
/** A holder's roots, cleaned and bounded (newest kept). */
function cleanRoots(list) {
  // verify r2 (F4, bound before parse): `own` sets are as long as the browser's page list (Chrome's own, unbounded) —
  // the dedupe is a Set, never an `includes` per item (quadratic: 8 000 ids = 60 ms on the loop)
  const out = [], seen = new Set();
  for (const r of Array.isArray(list) ? list : []) { const id = idKey(r); if (isTargetId(id) && !seen.has(id)) { seen.add(id); out.push(id); } }
  return out.slice(-MAX_ROOTS);
}
/** One more root on a holder's list (deduplicated, bounded — the oldest goes first). */
function addRoot(list, id) { const k = idKey(id); if (!isTargetId(k)) return cleanRoots(list); return cleanRoots([...cleanRoots(list).filter((x) => x !== k), k]); }

/**
 * WHOSE IS EACH TAB — `targets` = Target.getTargets' infos; `holders` = [{key, roots, active}] IN ORDER (the user's own
 * holder first, then the conversations' leases by age); `ephemeralKey` = the conversation whose own browser this is
 * (every page its). → Map<TARGETID, holderKey | 'orphan'>. Deterministic: (1) roots, first claim wins; (2) what a rooted
 * tab opened, transitively; (3) a holder's session's active tab nobody holds yet; (4) what THAT opened; the rest orphan.
 */
function tabOwners({ targets = [], holders = [], ephemeralKey = null } = {}) {
  const pages = pageTargets(targets);
  const out = new Map();
  if (ephemeralKey) { for (const x of pages) out.set(x.targetId, str(ephemeralKey)); return out; }
  const present = new Set(pages.map((x) => x.targetId));
  const hs = (Array.isArray(holders) ? holders : []).filter((h) => isObj(h) && str(h.key));
  // verify r2 (F4, bound before parse): the opener FOREST once (a tab has one opener), walked breadth-first from every
  // owned tab — linear in the page list. The fixpoint it replaces re-scanned every page per pass and resolved ONE tab
  // per pass on a chain of popups (measured: 8 000 tabs = 1.2 s on the loop, per `tabs` record); same answers: a tab
  // takes the owner of its nearest OWNED ancestor, a root claimed below an earlier holder's root keeps its own claim.
  const kids = new Map();
  for (const x of pages) if (x.openerId) { const l = kids.get(x.openerId); if (l) l.push(x.targetId); else kids.set(x.openerId, [x.targetId]); }
  const spread = () => { const q = [...out.keys()]; for (let i = 0; i < q.length; i++) { const id = q[i], k = out.get(id); if (k === 'orphan') continue; for (const c of kids.get(id) || []) if (!out.has(c)) { out.set(c, k); q.push(c); } } };
  for (const h of hs) for (const r of cleanRoots(h.roots)) if (present.has(r) && !out.has(r)) out.set(r, str(h.key));
  spread();
  for (const h of hs) { const a = idKey(h.active); if (isTargetId(a) && present.has(a) && !out.has(a)) out.set(a, str(h.key)); }
  spread();
  for (const x of pages) if (!out.has(x.targetId)) out.set(x.targetId, 'orphan');
  return out;
}
/** The set of target ids `key` holds (null when the owners could not be read — fail closed). */
function ownSetOf(owners, key) {
  if (!(owners instanceof Map)) return null;
  const s = new Set();
  for (const [id, k] of owners) if (k === key) s.add(id);
  return s;
}
/** The VIEW's word for one owner key: the viewed conversation's = agent, the user's = you, another holder's = other. */
function ownerWord(ownerKey, { me = null, humanKey = null } = {}) {
  const k = str(ownerKey);
  if (!k || k === 'orphan') return 'orphan';
  if (me && k === str(me)) return 'agent';
  if (humanKey && k === str(humanKey)) return 'you';
  if (/^hu-[0-9a-f]{8}$/.test(k)) return 'you';
  return 'other';
}

/**
 * THE AGENT'S `tab …` WORDS → one act. `argv` = the command as typed (`tab`, `tab list`, `tab new [--label x] [url]`,
 * `tab close [ref]`, `tab <ref>`; `--json` / `--pin-tab` are output / session flags). → {ok, act, ref, url, label, json}
 * | {ok:false, code:'bad-request', error}.
 */
function parseTabArgv(argv) {
  const a = (Array.isArray(argv) ? argv : []).map(str);
  const at = a.indexOf('tab');
  const rest = at >= 0 ? a.slice(at + 1) : a.slice();
  const json = rest.includes('--json');
  const words = [];
  let label = null;
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i];
    if (w === '--json' || w === '--pin-tab') continue;
    if (w === '--label') { label = rest[i + 1] !== undefined ? rest[i + 1] : ''; i++; continue; }
    if (w.startsWith('--label=')) { label = w.slice(8); continue; }
    if (w.startsWith('-')) return { ok: false, code: 'bad-request', error: `\`tab\` takes list | new [--label <name>] [url] | close [ref] | <ref> — not the flag ${w.slice(0, 40)}` };
    words.push(w);
  }
  if (label !== null && !LABEL_RE.test(label)) return { ok: false, code: 'bad-request', error: 'a tab label is 1-40 characters of letters, digits, `_`, `.`, `-`' };
  const [w0, w1, ...more] = words;
  if (!w0 || w0 === 'list') return more.length || w1 !== undefined || label !== null ? { ok: false, code: 'bad-request', error: '`tab list` takes nothing more' } : { ok: true, act: 'list', ref: null, url: null, label: null, json };
  if (w0 === 'new') return more.length ? { ok: false, code: 'bad-request', error: '`tab new` takes at most one url' } : { ok: true, act: 'new', ref: null, url: w1 === undefined ? null : w1, label, json };
  if (label !== null) return { ok: false, code: 'bad-request', error: '`--label` names a NEW tab (`tab new --label <name> [url]`)' };
  if (w0 === 'close') return more.length ? { ok: false, code: 'bad-request', error: '`tab close` takes at most one ref' } : { ok: true, act: 'close', ref: w1 === undefined ? null : w1, url: null, label: null, json };
  if (w1 !== undefined) return { ok: false, code: 'bad-request', error: '`tab <ref>` switches to ONE tab (t<N>, its label or its target id)' };
  return { ok: true, act: 'switch', ref: w0, url: null, label: null, json };
}
/** A tab ref (t<N> / a label / a CDP target id) → the target id, over the session's own `tab list` rows; null = none. */
function resolveTabRef(ref, tabs) {
  const r = str(ref).trim();
  if (!r) return null;
  const list = Array.isArray(tabs) ? tabs.filter(isObj) : [];
  if (isTargetId(r)) { const hit = list.find((x) => idKey(x.targetId) === idKey(r)); return hit ? idKey(hit.targetId) : null; }
  const hit = list.find((x) => (TAB_ID_RE.test(r) && str(x.tabId) === r) || (x.label && str(x.label) === r));
  return hit && isTargetId(hit.targetId) ? idKey(hit.targetId) : null;
}
/** `tab new <url>`: the web only — http(s), or about:blank (the agent's navigation rule, the server's belt). */
function newTabUrlVerdict(url) {
  if (url === null || url === undefined || url === '') return { ok: true, url: null };
  const u = str(url).trim();
  if (/^about:blank$/i.test(u)) return { ok: true, url: 'about:blank' };
  let p = null; try { p = new URL(u); } catch { p = null; }
  if (!p || !(p.protocol === 'http:' || p.protocol === 'https:') || !p.hostname) return { ok: false, code: 'not_web', error: `\`tab new\` opens a web page only (http:// or https://, or about:blank) — not ${u.slice(0, 80)}` };
  return { ok: true, url: p.href };
}
/** A tab row of the session's own `tab list --json` → the shape an answer carries. */
function tabRow(x) { return { id: TAB_ID_RE.test(str(x.tabId)) ? str(x.tabId) : null, targetId: idKey(x.targetId), label: x.label ? str(x.label).slice(0, 40) : null, title: str(x.title).slice(0, 300), url: str(x.url).slice(0, 2048), current: !!x.active }; }
/**
 * THE AGENT'S VIEW of the browser's tabs: its own rows (in the browser's order; `current` = its session's tab), and a
 * COUNT of the rest — never another holder's title or URL (their page content), never a `hu-` key. `owners` null
 * (unreadable) ⇒ null.
 */
function agentTabView({ tabs = [], owners = null, me = null } = {}) {
  if (!(owners instanceof Map)) return null;
  const rows = (Array.isArray(tabs) ? tabs : []).filter((x) => isObj(x) && isTargetId(x.targetId));
  const own = rows.filter((x) => owners.get(idKey(x.targetId)) === str(me)).map(tabRow);
  return { tabs: own, others: rows.length - own.length };
}
/**
 * MAY THE AGENT DO THIS? `own` = the set it holds (null = unreadable ⇒ fail closed); `current` = its session's tab;
 * `targetId` = the resolved ref (null = no such tab). list / new always; switch / close only an own tab; `close` with no
 * ref = its current tab. → {ok:true, targetId, closesCurrent?} | {ok:false, code, error}.
 */
function agentTabVerdict({ act = 'list', ref = null, targetId = null, own = null, current = null } = {}) {
  if (!AGENT_TAB_ACTS.includes(act)) return { ok: false, code: 'bad-request', error: `unknown tab act ${str(act).slice(0, 20)}` };
  if (act === 'new') return { ok: true, targetId: null };
  if (!(own instanceof Set)) return { ok: false, code: 'tabs_unreadable', error: tabRefusalText('tabs_unreadable', { agent: true }) };
  if (act === 'list') return { ok: true, targetId: null };
  const want = act === 'close' && (ref === null || ref === undefined || ref === '') ? (isTargetId(current) ? idKey(current) : null) : (isTargetId(targetId) ? idKey(targetId) : null);
  if (!want) return { ok: false, code: 'no_such_tab', error: act === 'close' && !ref ? 'your session has no current tab to close (it answered tab_gone) — `vibespace-browser tab list`, then `tab <id>` or `tab new <url>`' : `no tab ${str(ref).slice(0, 40)} in this browser — \`vibespace-browser tab list\` names yours` };
  if (!own.has(want)) return { ok: false, code: 'not_your_tab', error: tabRefusalText('not_your_tab', { agent: true }) };
  return { ok: true, targetId: want, closesCurrent: act === 'close' && isTargetId(current) && idKey(current) === want };
}
/**
 * MAY THE USER DO THIS FROM THIS VIEW? `owner` ∈ OWNER_WORDS (the view's word for the tab); `human` = the view is his own
 * browsing window; `driving` = this viewer holds the takeover (a conversation's view); `mediated` = a "separate tabs"
 * browser; `counts` = {agent, you} tabs held; `active` = the tab is the one on show; `adoptable` = an orphan he may take
 * (his window, no conversation leases the browser). → {ok:true, via:'lease'|'human'} | {ok:false, code, error}.
 */
function userTabVerdict({ act = 'switch', owner = 'orphan', human = false, driving = false, mediated = false, counts = {}, active = false, adoptable = false } = {}, tIn) {
  const no = (code, f = {}) => ({ ok: false, code, error: tabRefusalText(code, f, tIn) });
  if (!USER_TAB_ACTS.includes(act)) return no('bad-request');
  // lane ui-needs-a-button (主开发 Q2): a STOP — the page stops loading, nothing else (no tab moves, no url changes) — is the person's on
  // the viewed conversation's own tab WITHOUT a takeover, and on the person's own; never another conversation's, never nobody's, never mediated
  if (act === 'stop') return owner === 'you' ? { ok: true, via: 'human' } : owner === 'agent' && !human ? (mediated ? no('mediated_tabs') : { ok: true, via: 'lease' }) : no('not_your_tab');
  const c = isObj(counts) ? counts : {};
  if (owner === 'you') {
    if (act === 'switch') return human ? (active ? { ok: true, via: 'human', noop: true } : { ok: true, via: 'human' }) : no('not_your_tab', { yours: true });
    return Number(c.you) > 1 ? { ok: true, via: 'human' } : no('last_tab', { yours: true });
  }
  if (owner === 'orphan') return human && act === 'switch' && adoptable ? { ok: true, via: 'human', adopt: true } : no('not_your_tab', { orphan: true });
  if (owner === 'other' || human) return no('not_your_tab');
  // the viewed conversation's own tab (owner 'agent')
  if (mediated) return no('mediated_tabs');
  if (!driving) return no('take_over_first');
  // r4412 (B-bcf8): the tab on show, while the person drives — its switch is the session's own `tab <id>`, which brings it to the FRONT of
  // its window (U0b: it may sit behind another tab and paint nothing); `front` is THE one verdict (src/browser-windows.js currentTabFront)
  // the chip asks too (tabClickVerdict) and the keeper acts on — so the chip's button and the keeper's act cannot part, in EVERY browser
  if (act === 'switch') return active ? { ok: true, via: 'lease', noop: true, front: require('./browser-windows.js').currentTabFront({ owner, human, driving, mediated, active }) } : { ok: true, via: 'lease' };
  return Number(c.agent) > 1 ? { ok: true, via: 'lease' } : no('last_tab');
}
/** The host a tab's badge names (its initial + hue come from the channel avatar's rule on the client), '' for none. */
function hostOf(url) { try { const u = new URL(str(url)); return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.replace(/^www\./, '') : ''; } catch { return ''; } }
/** accept-fixes-strip F7 — MEASURED on the real agent-browser 0.38.1 (a scratch profile, pages with a real <title>,
 *  scripts/fixtures/agent-browser-0.38.1/tab-list.json): `tab list --json` AND the stream server's `tabs` record keep the
 *  title Chrome gave the tab WHILE IT LOADED — the address without its scheme ("127.0.0.1:38001/wiki/Tide") — long after
 *  the page named itself; CDP's Target.getTargets says "Tide - Wikipedia" at the same moment. A title that only repeats the
 *  address is no title. */
function isUrlTitle(title, url) {
  const t = str(title).trim();
  if (!t) return true;
  const u = str(url).trim();
  if (!u) return false;
  // the 2.369.204 integration (test-peer-parsers): the trailing-slash strip is a loop — `/\/+$/` re-scanned every slash run
  // from each start (a page-chosen url `////…x`: 64 KB took 3.9 s, ×3.3 per doubling)
  const bare = (v) => { v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''); let e = v.length; while (e > 0 && v.charCodeAt(e - 1) === 47) e--; return v.slice(0, e).toLowerCase(); };
  const a = bare(t), b = bare(u);
  return a === b || a === b.replace(/^www\./, '') || a === bare(u.replace(/[?#].*$/, ''));
}
/** The tab's PAGE title: CDP's (fresh — Target.getTargets), else the binary's, never an address dressed as a title ('' —
 *  the chip then says the host). Both are page-chosen text: bounded like the rows (300). */
function pageTitleOf(row, cdpTitle) {
  const url = str(row && row.url);
  for (const v of [cdpTitle, row && row.title]) { const t = str(v).trim().slice(0, 300); if (t && !isUrlTitle(t, url)) return t; }
  return '';
}
/** The page titles a CDP read gives (`{targetId: title}`), bounded — the keeper's answer the bridge sends the view. */
function titlesOf(targets) {
  const out = {};
  for (const x of pageRows(targets)) if (x.title) out[x.targetId] = x.title;
  return out;
}
/** The page targets WITH their title and url (pageTargets keeps only the ownership facts), bounded like the rows. */
function pageRows(targets) {
  return (Array.isArray(targets) ? targets : []).filter((x) => isObj(x) && str(x.type || 'page') === 'page' && isTargetId(x.targetId))
    .map((x) => ({ targetId: idKey(x.targetId), title: str(x.title).trim().slice(0, 300), url: str(x.url).slice(0, 2048) }));
}
/** F8: an unowned tab with nothing on it (a session's spare blank tab) is not a chip — nothing to watch, nothing to say. */
// row B-0e4a: a lease's root born at its own marked blank (about:blank#vs-own-<24 hex>) is a blank until its first navigation — for
// the HUB's own reads (the settling read, the spare-blank fold): ONE shape, OWN_BLANK_RE, in BLANK_URL_RE and isOwnBlank. No page ever
// sees it: the mark leaves the hub in no view (markOut below, 主开发 r4319)
const OWN_BLANK_RE = /^about:blank#vs-own-[0-9a-f]{24}$/i;
const isOwnBlank = (u) => OWN_BLANK_RE.test(str(u).trim());
const BLANK_URL_RE = new RegExp(`^(?:about:blank|${OWN_BLANK_RE.source.slice(1, -1)}|chrome:\\/\\/(?:newtab|new-tab-page)\\/?|)$`, 'i');
/** A title for the chip: ≤ 24 characters (the full title rides the tooltip). */
function chipTitle(title, url) {
  // verify r1 F4 (bound before parse): a page chose the title — cut to TITLE_CHIP × 4 code units BEFORE the code-point walk
  // (40 rows × 512 KiB titles walked whole = 438 ms per `tabs` record on the client's main thread, measured)
  const s = (str(title).trim() || hostOf(url) || str(url).trim() || '—').slice(0, TITLE_CHIP * 4);
  const g = Array.from(s);
  return g.length > TITLE_CHIP ? g.slice(0, TITLE_CHIP - 1).join('') + '…' : s;
}
/** accept-fixes F9: chips that cut to the SAME words keep their head AND tail (`en.wikipe…/wiki/Tide_pool`) — what tells
 *  two pages of one site apart is usually the end of the title or address. Bounded like chipTitle (a page chose both). */
function chipTitleTail(title, url) {
  const full = str(title).trim() || str(url).trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') || '—';
  const head = Array.from(full.slice(0, TITLE_CHIP * 4)), tail = Array.from(full.slice(-TITLE_CHIP * 4));
  if (full.length <= TITLE_CHIP * 4 && head.length <= TITLE_CHIP) return full;
  return head.slice(0, 9).join('') + '…' + tail.slice(-(TITLE_CHIP - 10)).join('');
}
/**
 * THE TAB ROW's model — the client's ONE reader (no control is drawn that the verdict refuses). `tabs` = the stream's
 * `tabs` record rows; `owners` = {targetId: OWNER_WORDS} (the bridge's `tab-owners`; a tab it has not judged yet is
 * `orphan` — nothing is drawn on it); `viewer` = {human}; `driving`; `mediated`; `adoptable` (his window: the orphans
 * are his to take). → {rows:[…], counts, anyAgent}
 * B-26bb: `stale` = the tabs are a STOPPED run's (the view reconnected after a stop and the new run has sent no `tabs` record
 * yet) — no chip is drawn (nothing stale to click; the status line says the moment).
 */
/** B-26bb (主开发's law, its verdict): the live view's chips are STALE from the moment the view RECORDS A STOP until the next
 *  `tabs` record — on EVERY road back (the Resume press, a rejoin, a reconnect): one rule at the stop, never one per road; a pane
 *  switch is a fresh view. Every other event (the Resume press itself, a hello, upstream-open) leaves it as it is. PURE. */
function tabsStaleStep(stale, event) {
  if (event === 'stopped') return true;
  if (event === 'tabs' || event === 'switch') return false;
  return !!stale;
}
function tabRowModel({ tabs = [], owners = {}, viewer = {}, driving = false, mediated = false, adoptable = false, titles = {}, names = {}, windows = {}, leases = [], me = null, stale = false, front = null, made = {} } = {}, tIn) {
  const t = tOf(tIn);
  const human = !!(viewer && viewer.human);
  const ow = isObj(owners) ? owners : {};
  const wordOf = (x) => { const w = str(ow[idKey(x.targetId)] || ow[str(x.targetId)]); return OWNER_WORDS.includes(w) ? w : 'orphan'; };
  const tt = isObj(titles) ? titles : {}, nm = isObj(names) ? names : {};
  // B-e674 unit 1: the hub's verdict on the front of this view's window — a FOREIGN front tab is always drawn (even a blank
  // nobody holds), marked, and its tip says whose it is
  const fv = isObj(front) && front.state === 'foreign' && isTargetId(front.targetId) ? front : null;
  const frontId = fv ? idKey(fv.targetId) : null;
  // accept-fixes-strip F7: the PAGE's title (CDP's, else the binary's — never an address dressed as one); F8: a blank
  // tab nobody holds is not drawn (the tab on show always is)
  const list = (Array.isArray(tabs) && !stale ? tabs : []).filter((x) => isObj(x) && isTargetId(x.targetId)) // B-26bb: a stopped run's tabs draw nothing
    .map((x) => ({ ...x, title: pageTitleOf(x, tt[idKey(x.targetId)]) }))
    .filter((x) => x.active || idKey(x.targetId) === frontId || wordOf(x) !== 'orphan' || !BLANK_URL_RE.test(str(x.url).trim()));
  const counts = { agent: 0, you: 0, other: 0, orphan: 0 };
  for (const x of list) counts[wordOf(x)]++;
  const plain = list.map((x) => chipTitle(x.title, x.url));
  const twin = new Set(plain.filter((v, i) => plain.indexOf(v) !== i)); // F9: two chips that would read the same
  const rows = list.map((x, i) => {
    const owner = wordOf(x);
    const facts = { owner, human, driving, mediated, counts, active: !!x.active, adoptable };
    const sw = userTabVerdict({ act: 'switch', ...facts }, tIn);
    const cl = userTabVerdict({ act: 'close', ...facts }, tIn);
    // verify r1 F4: the tip and the url are BOUNDED like the kept store's rows (a title ≤ 300, a url ≤ 2048 — a page chose both)
    const url = str(x.url).slice(0, 2048);
    const full = str(x.title).trim().slice(0, 300) || url;
    const fw = frontId === idKey(x.targetId) ? frontText({ ...fv, owner }, { name: nameOfHolder(nm[idKey(x.targetId)]) }, tIn) : { mark: '', tip: '' };
    const mw = madeText(isObj(made) ? made[idKey(x.targetId)] : null, owner, tIn); // B-e674 unit 2: the birth stamp, named
    return {
      targetId: idKey(x.targetId), tabId: str(x.tabId), title: twin.has(plain[i]) ? chipTitleTail(x.title, x.url) : plain[i], tip: full === url ? full : `${full} — ${url}`, url, host: hostOf(x.url), active: !!x.active, owner,
      mark: ownerMarkText(owner, { human, name: nameOfHolder(nm[idKey(x.targetId)]) }, tIn) + (mw.mark ? ' · ' + mw.mark : ''), markTip: (mw.tip ? mw.tip + '\n' : '') + ownerTipText(owner, { human, name: nameOfHolder(nm[idKey(x.targetId)]) }, tIn),
      // accept-fixes F4: the tab the agent is WORKING ON says so on its chip (never only a border) — apart from the one
      // this view watches (the dashed chip)
      here: owner === 'agent' && !!x.active, hereText: owner === 'agent' && x.active ? t('The agent is here') : '',
      front: !!fw.mark, frontText: fw.mark, frontTip: fw.tip, // B-e674 unit 1: a foreign tab in front of this view's window
      canSwitch: sw.ok && !sw.noop, canClose: cl.ok,
      switchTip: sw.ok && !sw.noop ? t('Switch to this tab') : '', closeTip: cl.ok ? t('Close tab') : '',
    };
  });
  // lane browser-tabs-by-window: the chips BY WINDOW — this view's window first, then each other holder's, then the rest;
  // a window's spare blank folds into its group (the pane's head says the count), never the chip on show
  const wn = isObj(windows) ? windows : {};
  const g = tabGroups({ tabs: list.map((x) => ({ targetId: x.targetId, url: x.url, active: x.active, windowId: wn[idKey(x.targetId)] })), leases, me, human, front: frontId }, tIn);
  const byId = new Map(rows.map((r) => [r.targetId, r]));
  // B-e674 unit 2 (its round's should 2): a foreign front with no tab of this list to mark is said in general words
  const frontNote = isObj(front) && front.state === 'foreign' && !(frontId && byId.has(frontId)) ? frontNoteText(tIn) : null;
  const groupOf = new Map(); for (const gr of g.groups) for (const id of gr.targetIds) groupOf.set(id, gr.key);
  return { rows: g.order.map((id) => ({ ...byId.get(id), group: groupOf.get(id) })), counts, anyAgent: counts.agent > 0, groups: g.groups, grouped: g.grouped, blanks: g.blanks, frontNote };
}

// ── lane browser-tabs-by-window (the owner, 2026-10-08 "好做吧"): THE TABS BY WINDOW ─────────────────────────────────
// MEASURED on the owner's instance (read-only, keeper journal 17:53:16Z): profile hanabi-work carried TWO leases, each in a
// window of its own (lane browser-windows: one window per holder) — and the live view's Tabs pane listed the WHOLE browser
// flat ("Tabs (4)": Enterprise, Read, about:blank, about:blank), the row put the other conversation's chip beside the
// agent's, so the owner read two agents in one window. The windows were right; the LIST did not say which window a tab is in.
/** A blank tab: about:blank / the new-tab page / no address (F8's BLANK_URL_RE) — nothing on it to watch. */
function isBlankTab(x) { return BLANK_URL_RE.test(str(x && x.url).trim()); }
/** Chrome's window id as a number; unread = null, never 0 (browser-windows' windowIdOf — this module imports only the belt). */
function windowIdIn(v) { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
/** A group's head, in the VIEW's words — the holder by name, NEVER a window number (Chrome's ids are 9 digits). */
function windowLabelText(kind, { word = 'other', name = '' } = {}, tIn) {
  const t = tOf(tIn);
  if (kind === 'own') return t('This window');
  if (kind === 'elsewhere') return t('Elsewhere in this browser');
  if (word === 'you') return t('Your window');
  if (word === 'agent') return t('The agent’s window');
  const n = nameOfHolder(name);
  return n ? t('{name}’s window', { name: n }) : t('Another conversation’s window');
}
/**
 * WHICH WINDOW EACH TAB IS IN — the groups the tab row and the Tabs pane draw, in a FIXED order: THIS view's window first
 * (the window of the lease the view shows — his own window on his browsing view; no lease window ⇒ `me`, else the window of
 * the tab on show), then each OTHER holder's window in the holders' order (the user first, then the conversations by age),
 * named by its holder (`holder` = {word, name}: OWNER_WORDS from this view + the conversation's live name — never a window
 * number, never a session id), then every tab whose window is unread or held by nobody ("Elsewhere in this browser"). A
 * tab's window is the keeper's Browser.getWindowForTarget answer (`windowId`, null = unread) — never guessed from its owner:
 * a lease without a window id names no group, its tabs land Elsewhere.
 * THE ANCHOR — a window's spare blank (the about:blank a session's daemon opens at its first command beside the window's
 * real tab; nothing records which one) — FOLDS into its group as a count: a blank tab, not the one on show, in a KNOWN
 * window that keeps another tab drawn. Never folded: a window's only tab (all blank ⇒ the first stays), the tab on show (so
 * a folded tab is never "the agent is here"), a blank whose window is unread. PURE.
 *   tabs = [{targetId, url, active, windowId}] in the browser's order · leases = [{windowId, holder:{word, name}}] in the
 *   holders' order · me = this view's window when no lease says it · human = the view is his own browsing window
 * → {grouped, groups:[{key, kind:'own'|'holder'|'elsewhere', label, tip, blankText, targetIds, blanks}], order, blanks}
 */
function tabGroups({ tabs = [], leases = [], me = null, human = false, front = null } = {}, tIn) {
  const t = tOf(tIn);
  const list = (Array.isArray(tabs) ? tabs : []).filter((x) => isObj(x) && isTargetId(x.targetId)).map((x) => ({ id: idKey(x.targetId), win: windowIdIn(x.windowId), blank: isBlankTab(x), active: !!x.active }));
  const ls = (Array.isArray(leases) ? leases : []).filter((l) => isObj(l) && windowIdIn(l.windowId) != null)
    .map((l) => { const h = isObj(l.holder) ? l.holder : {}; return { win: windowIdIn(l.windowId), word: OWNER_WORDS.includes(str(h.word)) ? str(h.word) : 'other', name: str(h.name) }; });
  const shown = list.find((x) => x.active);
  const fr = isTargetId(front) ? idKey(front) : null;
  const mine = ls.find((l) => l.word === (human ? 'you' : 'agent'));
  const own = mine ? mine.win : windowIdIn(me) != null ? windowIdIn(me) : shown ? shown.win : null;
  const heads = [];
  if (own != null) heads.push({ kind: 'own', win: own, label: windowLabelText('own', {}, tIn) });
  for (const l of ls) if (!heads.some((h) => h.win === l.win)) heads.push({ kind: 'holder', win: l.win, label: windowLabelText('holder', l, tIn) });
  const groups = [...heads, { kind: 'elsewhere', win: null, label: windowLabelText('elsewhere', {}, tIn) }].map((h) => ({ ...h, key: h.win == null ? 'elsewhere' : 'w' + h.win, members: [] }));
  const at = new Map(groups.filter((g) => g.win != null).map((g) => [g.win, g]));
  for (const x of list) (at.get(x.win) || groups[groups.length - 1]).members.push(x);
  // the anchor rule, per window (Elsewhere may hold several)
  const perWin = new Map();
  for (const x of list) if (x.win != null) { const a = perWin.get(x.win); if (a) a.push(x); else perWin.set(x.win, [x]); }
  const folded = new Set();
  for (const xs of perWin.values()) {
    const spare = xs.filter((x) => x.blank && !x.active && x.id !== fr); // B-e674: the tab in front of a window is drawn, never folded
    for (const x of spare.length === xs.length ? spare.slice(1) : spare) folded.add(x.id);
  }
  const out = groups.filter((g) => g.members.length).map((g) => {
    const blanks = g.members.filter((x) => folded.has(x.id)).map((x) => x.id);
    const blankText = blanks.length ? t('+{n} blank', { n: blanks.length }) : '';
    return { key: g.key, kind: g.kind, label: g.label, blankText, tip: blanks.length ? `${g.label} — ${t('{n} blank tab(s) beside its pages — nothing on them', { n: blanks.length })}` : g.label,
      targetIds: g.members.filter((x) => !folded.has(x.id)).map((x) => x.id), blanks };
  });
  return { grouped: out.length > 1, groups: out, order: out.flatMap((g) => g.targetIds), blanks: folded.size };
}
/** The Tabs pane's count: the tabs drawn, the folded blanks beside them — "2 · +2 blank" / "4". */
function tabsCountText({ order = [], blanks = 0 } = {}, tIn) {
  const t = tOf(tIn);
  const n = Array.isArray(order) ? order.length : 0, b = Number(blanks) || 0;
  return b > 0 ? t('{n} · +{b} blank', { n, b }) : String(n);
}

// ── B-e674 unit 1 (the coordinator's r548 / r562): THE FRONT OF THIS VIEW'S WINDOW ─────────────────────────────────────
// On a shared profile a tab that is not this holder's can sit in FRONT of its window. A plain create lands in Chrome's
// last focused window (src/browser-windows.js WINDOWS_PROOF); another holder's page, or a tab the browser itself made,
// can be there too. The window then shows a page this view's row could not name: the root behind the owner's report of
// 2026-11-19 (B-c9e3, whose cure keeps the picture this view's own tab). The keeper reads which of the window's tabs is
// visible, and only when two or more share it. This verdict names that tab. NOTHING is moved, closed or activated for it:
// CDP has no move, a close loses a page, and an activation changes what someone sees.
/** The most window-mates one read asks (a window of more names its front only when the asked ones answer it). */
const FRONT_READS_MAX = 8;
/** B-e674 unit 2 (its round's read): ONE front read's bound — shorter than a page reader's own (2.5 s), so a hung page holds the
 *  tab-owners record back at most ~2 s (the view's own tab, then its mates at once). */
const FRONT_READ_MS = 1000;
// THE READ IS THE PAGE'S OWN WORD (its round's should 3): `document.visibilityState` is evaluated in the page's world, and a page
// can override it. A page that lies `visible` beside the real front makes two answers (⇒ unread, no chip); alone, with the view's
// own tab not asked first, it marks ITS chip «In front». The worst it can cause is a wrong chip and one journal line on that view:
// no title or address of another tab, and NEVER an act — nothing may be moved, closed or activated on this verdict, ever.
const FRONT_STATES = Object.freeze(['none', 'single', 'unread', 'own', 'foreign']);
/**
 * `windowId` = this view's window (the viewed holder's: a lease's stamped window, the person's own tab's window);
 * `windows` = {TARGETID: windowId|null} (the keeper's reads); `visible` = the tabs of that window whose page answered
 * `visible`; `owners` = {TARGETID: OWNER_WORDS} in the VIEW's words; `human` = the view is the person's own browsing window.
 * → {state, windowId, targetId, owner, mates}:
 *   none     no window is known for this view
 *   single   it holds one tab (nothing can stand in front of it)
 *   unread   two or more, and not exactly ONE of them answered visible (a window shows one tab: never guessed)
 *   own      the tab in front is this view's holder's (`agent` on a conversation's view, `you` on the person's)
 *   foreign  the tab in front is another conversation's (`other`), the person's on a conversation's view (`you`), or
 *            nobody's (`orphan`). PURE.
 */
function frontVerdict({ windowId = null, windows = {}, visible = [], owners = {}, human = false } = {}) {
  const w = windowIdIn(windowId);
  if (w == null) return { state: 'none', windowId: null, targetId: null, owner: null, mates: 0 };
  const wn = isObj(windows) ? windows : {};
  const mates = Object.keys(wn).filter((id) => isTargetId(id) && windowIdIn(wn[id]) === w).map(idKey);
  if (mates.length < 2) return { state: 'single', windowId: w, targetId: mates[0] || null, owner: null, mates: mates.length };
  const mateSet = new Set(mates); // one pass each (a window's page list is Chrome's own length)
  const vis = [...new Set((Array.isArray(visible) ? visible : []).map(idKey))].filter((id) => mateSet.has(id));
  if (vis.length !== 1) return { state: 'unread', windowId: w, targetId: null, owner: null, mates: mates.length };
  const ow = isObj(owners) ? owners : {};
  const word = OWNER_WORDS.includes(str(ow[vis[0]])) ? str(ow[vis[0]]) : 'orphan';
  return { state: word === (human ? 'you' : 'agent') ? 'own' : 'foreign', windowId: w, targetId: vis[0], owner: word, mates: mates.length };
}
/** A FOREIGN front tab's words: its chip's short line (`mark`) and its tip (whose it is, then what this view does about it). */
/** B-e674 unit 2: a tab's BIRTH STAMP in words. RULING (i) (r683): a tab born in the person's takeover of a conversation's view is
 *  that conversation's — NAMED on ITS view only (`mine`: «opened in your takeover»); a tab no page opened, made while the person drove
 *  THEIR OWN window, is the person's own (`you`) — its tip says why. → {mark, tip} ('' when there is nothing to say). */
function madeText(m, owner, tIn) {
  const t = tOf(tIn);
  if (!isObj(m)) return { mark: '', tip: '' };
  if (m.person && owner === 'you') return { mark: '', tip: t('Your tab — opened while you drove this window') };
  // r683: named only on the view of the conversation that was taken over, on its own tab (`mine`: the stamp's conversation is this view's)
  if (!m.person && m.made === 'takeover' && m.mine === true && owner === 'agent') return { mark: t('opened in your takeover'), tip: t('Opened during your takeover — it stays this conversation’s tab') };
  return { mark: '', tip: '' };
}
/** B-e674 follow (r694 (3)): THE HANDBACK SAYS WHAT STAYS — how many of the tabs this view lists were opened in the takeover that
 *  began at `since` and stay with this conversation (its own, marked «opened in your takeover»: `mine`). One pass over the list. */
function takeoverStays({ tabs = [], made = {}, since = 0 } = {}) {
  const from = Number(since) || 0; const seen = new Set(); let n = 0;
  for (const tb of Array.isArray(tabs) ? tabs : []) {
    const id = tb && tb.targetId ? String(tb.targetId).toUpperCase() : ''; if (!id || seen.has(id)) continue; seen.add(id);
    const m = isObj(made) ? made[id] : null;
    if (isObj(m) && m.made === 'takeover' && m.mine === true && !m.person && (Number(m.at) || 0) >= from) n++;
  }
  return n;
}
/** …and its words, said with the handback (the person's last look before the agent may read them). '' when none stays. */
function handbackStayText(n, tIn) {
  const t = tOf(tIn); const k = Number.isInteger(n) && n > 0 ? n : 0;
  if (!k) return '';
  return k === 1 ? t('1 tab opened in your takeover stays with this conversation — its agent can read it now') : t('{n} tabs opened in your takeover stay with this conversation — its agent can read them now', { n: k });
}
/** 主开发 r5164 (2), a silence of the release: THE HAND-BACK'S ANSWER READ WHOLE. The route answers the person's Continue: ok (the note
 *  queued; `durable` false = in memory only, not on disk yet), or `stash_refused` — the takeover ENDED and the card was shown, only the note
 *  could not be queued (its error text names the stash's file: never shown). The page said «handed back» for every ok, and «could not
 *  hand the browser back: <the error>» for a stash_refused that did hand it back. → { handedBack, text, warn } (text '' when not handed
 *  back: the page's own refusal words stand; `no_conversation_id` — refused BEFORE any act, the takeover still on — its own words). No
 *  path, no value. */
function handBackAnswerWords(r, tIn) {
  const t = tOf(tIn);
  // r5235 should: the conversation's OWN browser — the note still rides its next browser command (keeper.noteContinue): the softer words
  if (r && r.code === 'stash_refused' && r.own === true) return { handedBack: true, warn: true, text: t('Handed back — your note could not be queued for the agent\'s next turn (VibeSpace could not write it); its next browser command is told instead') };
  if (r && (r.code === 'stash_refused' || (r.ok === true && r.stashed === false))) return { handedBack: true, warn: true, text: t('Handed back, but your note could not be queued for the agent\'s next turn (VibeSpace could not write it) — take the browser over again to hand it back anew') };
  // r5235: the refusal BEFORE any act (the conversation has no id yet: the takeover NOT ended) — never «handed back»; its own words
  if (r && r.code === 'no_conversation_id') return { handedBack: false, warn: false, text: t('Not handed back — this conversation has no id yet (its first reply has not come back): hand it back after the agent has answered once') };
  if (!r || r.error || r.ok === false) return { handedBack: false, warn: false, text: '' };
  if (r.durable === false) return { handedBack: true, warn: true, text: t('Handed back — your note is not on disk yet: if VibeSpace restarts before the agent\'s next turn, the agent will not read it') };
  return { handedBack: true, warn: false, text: t('Handed back — the agent reads your note and the tabs with its next turn (nothing is sent now)') };
}
/** A FOREIGN front this view does NOT list (the bridge sends its state alone — no id, no name, no title): one general line. */
function frontNoteText(tIn) {
  const t = tOf(tIn);
  return { text: t('Another tab is in front of this window'), tip: t('A tab this view does not list is in front of this window — the picture here stays this view’s own tab; nothing is moved or closed for it') };
}
function frontText(v, { name = '' } = {}, tIn) {
  const t = tOf(tIn);
  if (!isObj(v) || v.state !== 'foreign') return { mark: '', tip: '' };
  const who = v.owner === 'other' ? (name ? t('{name}’s tab', { name: str(name) }) : t('Another conversation’s tab')) : v.owner === 'you' ? t('Your tab') : t('A tab nobody holds');
  return { mark: t('In front of this window'), tip: t('{who} is in front of this window — the picture here stays this view’s own tab; nothing is moved or closed for it', { who }) };
}

// ── THE WORDS (en; the client passes its t() — every key has zh + ja rows) ─────────────────────────────────────────
/** F8: another holder's REAL name (the conversation's, the job's) — page-free text, still bounded (≤ 24 on the chip). */
function nameOfHolder(v) { const n = str(v && typeof v === 'object' ? v.name : v).replace(/\s+/g, ' ').trim(); if (!n) return ''; const g = Array.from(n.slice(0, TITLE_CHIP * 4)); return g.length > TITLE_CHIP ? g.slice(0, TITLE_CHIP - 1).join('') + '…' : n; }
/** The chip's short owner mark. */
function ownerMarkText(owner, { human = false, name = '' } = {}, tIn) {
  const t = tOf(tIn);
  if (owner === 'agent') return t('The agent’s');
  if (owner === 'you') return t('Yours');
  if (owner === 'other') return name ? str(name) : t('Another conversation’s');
  return human ? t('Nobody’s') : t('Nobody’s');
}
/** The mark's tooltip: the fact and, where it has one, the way to act. */
function ownerTipText(owner, { human = false, name = '' } = {}, tIn) {
  const t = tOf(tIn);
  if (owner === 'agent') return t('The agent’s tab — take over to switch or close it; the agent is told at the handback');
  if (owner === 'you') return human ? t('Your tab') : t('Your own tab (Browse yourself)');
  if (owner === 'other') return name ? t('{name}’s tab — watch it here (view only); open its own live view to drive it', { name }) : t('Another conversation’s — open its live view to use it');
  return human ? t('Nobody’s tab') : t('Nobody’s tab — open Browse yourself on this profile to take it');
}
/** lane browser-unresponsive: a HUNG browser's refusal to the agent (English, never t()) — the FACT (since when, how long)
 *  and the recipe, never "run the command again" (the measured inc: the agent retried 4× in 7 min, for 80 min). */
function unresponsiveAgentText({ label = '', since = 0, now = 0, tabs = null } = {}) {
  const d = new Date(Number(since) || 0), clock = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  const min = Math.max(1, Math.round(((Number(now) || 0) - (Number(since) || 0)) / 60000));
  const n = Number.isInteger(tabs) && tabs > 0 ? `, ${tabs} tab(s) re-opened` : '';
  return `the browser of profile "${label}" has not answered since ${clock} UTC (${min} min) — it is hung, not busy; nothing ran. \`vibespace-browser restart\` relaunches it (logins kept${n}; every other conversation on it is told) — or ask the user to press Restart in the Browser panel`;
}
/** Every refusal's words. `f.agent` = the agent-facing sentence (never t()-wrapped by the server). */
function tabRefusalText(code, f = {}, tIn) {
  const t = f && f.agent ? fill : tOf(tIn);
  switch (code) {
    case 'not_your_tab':
      // B-19a9 (主开发 r2182 (1)): a tab NO holder is on record for, on a paired machine's shared profile — a tab its own agent opened
      // there BEFORE the scope road (that road passed straight through, so nothing was recorded) is said by its own words, never «another's»
      if (f && f.agent && f.unrecorded) return 'that tab is no holder\'s on record — on a paired machine\'s browser, a tab opened before this update was not recorded as anyone\'s, so it is not known as yours; `vibespace-browser tab new <url>` opens one that is (`vibespace-browser tab list` names your tabs)';
      if (f && f.agent) return 'that tab is not yours — it belongs to another holder of this browser (another conversation, or the user); you list, switch to and close only your own tabs (`vibespace-browser tab list`)';
      if (f && f.yours) return t('Switch to your own tab from your browsing window');
      if (f && f.orphan) return t('Nobody’s tab — open Browse yourself on this profile to take it');
      return t('Another conversation’s — open its live view to use it');
    // lane browser-unresponsive: the first minute is `tabs_unreadable` (busy ≠ hung); once the browser is JUDGED hung
    // (`f.unresponsive` = {label, since, now, tabs}, browser-stuck's verdict) the words carry the fact and the one way out
    case 'tabs_unreadable': if (f && f.unresponsive) return f.agent ? unresponsiveAgentText(f.unresponsive) : t('The browser is not answering — Restart it from the Browser panel');
      return f && f.agent ? 'the browser\'s tabs could not be read just now — nothing ran; run the command again' : t('The tabs could not be read just now — try again');
    case 'browser_unresponsive': return f && f.agent ? unresponsiveAgentText((f && f.unresponsive) || {}) : t('The browser is not answering — Restart it from the Browser panel');
    case 'no_such_tab': return t('That tab is gone');
    case 'stop_failed': return t('The page did not stop — it is not answering');
    case 'take_over_first': return t('Take over to switch or close the agent’s tabs');
    case 'last_tab': return f && f.yours ? t('This is your only tab — press Close to end your browsing') : t('This is the agent’s only tab — Close all tabs (quit this browser) ends it');
    case 'mediated_tabs': return t('This browser keeps each conversation’s tabs apart — its tabs are switched and closed by the agent');
    case 'not_web': return t('Only web addresses');
    default: return t('Could not do that');
  }
}
/**
 * WHAT THE USER DID TO THE AGENT'S TABS WHILE HE DROVE — agent-facing (the handback, the hand-back-and-continue frame):
 * "While driving, the user closed 2 of your tabs (“Cart — https://shop.example/cart”, …) and switched your current tab
 * to “Docs — https://docs.example/”." — '' when nothing. `acts` = [{kind:'tab-close'|'tab-switch', title, url}] in order.
 */
function userActsSentence(acts) {
  const list = (Array.isArray(acts) ? acts : []).filter((a) => isObj(a) && (a.kind === 'tab-close' || a.kind === 'tab-switch' || a.kind === 'tab-stop'));
  if (!list.length) return '';
  const q = (a) => { const ti = str(a.title).trim().slice(0, 80), u = str(a.url).slice(0, 200); return `“${ti && u ? ti + ' — ' + u : (ti || u || 'a tab')}”`; };
  const closed = list.filter((a) => a.kind === 'tab-close');
  const sw = [...list].reverse().find((a) => a.kind === 'tab-switch');
  const parts = [];
  if (closed.length) parts.push(`closed ${closed.length === 1 ? 'one of your tabs' : closed.length + ' of your tabs'} (${closed.slice(0, 6).map(q).join(', ')}${closed.length > 6 ? `, and ${closed.length - 6} more` : ''})`);
  if (sw) parts.push(`switched your current tab to ${q(sw)}`);
  const stopped = list.filter((a) => a.kind === 'tab-stop');
  if (stopped.length) parts.push(`stopped ${stopped.slice(0, 6).map(q).join(', ')} loading`);
  return `While driving, the user ${parts.join(' and ')}.`;
}
/** One user act on the cycle's list (bounded, newest kept). */
function noteUserActIn(list, act) {
  const a = isObj(act) && (act.kind === 'tab-close' || act.kind === 'tab-switch' || act.kind === 'tab-stop') ? { kind: act.kind, title: str(act.title).slice(0, 300), url: str(act.url).slice(0, 2048), at: Number(act.at) || 0 } : null;
  const out = (Array.isArray(list) ? list : []).slice();
  if (a) out.push(a);
  return out.slice(-MAX_USER_ACTS);
}
/** The agent's list, as the CLI prints it: `t3  Title — url  [current]` per own tab, then the count of the rest. */
function agentTabLines(view) {
  if (!isObj(view)) return [];
  const own = Array.isArray(view.tabs) ? view.tabs : [];
  const lines = own.map((x) => `${x.id || x.targetId}${x.label ? ' (' + x.label + ')' : ''}  ${str(x.title).trim() ? str(x.title).trim().slice(0, 120) + ' — ' : ''}${str(x.url).slice(0, 300)}${x.current ? '  [current]' : ''}`);
  if (!own.length) lines.push('(none of this browser\'s tabs is yours — `vibespace-browser tab new <url>` opens one)');
  const n = Number(view.others) || 0;
  if (n > 0) lines.push(`${n} other tab${n === 1 ? '' : 's'} in this browser ${n === 1 ? 'is' : 'are'} not yours (another conversation's, or the user's) — never listed, switched to or closed from here`);
  return lines;
}

// ── LANE PROFILE-LOCK-ROLL (2026-10-01) L2: A BOUND TAB OF A PREVIOUS LIFE REBINDS ──
// Measured on 0.38.1 (its own `tab --help`): "each session remembers its active tab (bound by CDP target id) and returns to
// it after a daemon restart; with --pin-tab, commands fail with tab_gone instead of falling back". Every tab of a REPLACED
// browser is gone (lane H verify r2), so the first pinned command after a browser life the keeper did not end by a
// `stop()` — a daemon found dead (a pod roll, a crash), a boot that could not adopt it, an in-place relaunch — answered
// `tab_gone` (userW, W2) and the agent had to `tab new` by hand. The keeper marks every lease of the replaced browser
// (`tabClosed`, the mark a stop already leaves) and its next attach binds a tab BEFORE the command runs:
/**
 * WHICH tab a session whose bound tab is gone is rebound to, from the browser's live page list: the ONE page tab that
 * exists and that no holder roots (a fresh launch's single `about:blank`; a restored browser's only page) — bound to
 * (`tab <targetId>`: no second blank tab per relaunch); anything else (several pages, the only page another holder's,
 * nothing readable) ⇒ null ⇒ a NEW tab of its own (never another holder's). PURE.
 *   targets = Target.getTargets' infos · holders = tabHoldersOf's rows (the user's holder first) · key = the session's
 */
function rebindPick({ targets = null, holders = [], key = '' } = {}) {
  if (!Array.isArray(targets)) return null;
  const pages = pageTargets(targets);
  if (pages.length !== 1) return null;
  const only = pages[0];
  const owners = tabOwners({ targets, holders: (Array.isArray(holders) ? holders : []).filter((h) => isObj(h) && str(h.key) !== str(key)) });
  if (owners.get(only.targetId) && owners.get(only.targetId) !== 'orphan') return null;
  const raw = targets.find((x) => isObj(x) && idKey(x.targetId) === only.targetId) || {}; // pageTargets keeps no url — the note names the page
  return { targetId: only.targetId, url: markOutText(str(raw.url)) || 'about:blank' }; // row B-0e4a (r4339 follow): kept out at the WRITE — the rebound note and the journal line are made from it
}
/** Row B-0e4a (主开发 r4252 / r4264): A LEASE's OWN TAB, KNOWN AGAIN AFTER A RESTART. The keeper births the lease's root tab at a
 *  hub-made address — about:blank with the lease's own random mark as its fragment — and Chrome's own restore («continue where you
 *  left off») keeps that address as the restored tab's FIRST history entry, after the agent navigated on (probe 14, box row 811: one
 *  carrier, entry 0). A page's script never reads another history entry's address. `OWN_MARK_RE` = the mark's own shape (random hex,
 *  never an address or a title). PURE. */
const OWN_MARK_RE = /^[0-9a-f]{24}$/;
const ownMarkUrl = (mark) => (OWN_MARK_RE.test(str(mark)) ? `about:blank#vs-own-${mark}` : null);
/**
 * Row B-0e4a: WHICH restored page the lease takes back. `candidates` = the page targets no holder roots (orphans); `carries` = a Map
 * target id → true (its FIRST history entry is this lease's own mark) | false (it is not) | null (its history did not answer in time).
 * EXACTLY ONE carrier ⇒ { take: id }; any unknown ⇒ { why: 'unknown' } (an unread page could carry it too: never «not the lease's»);
 * none ⇒ { why: 'none' }; two or more (a person duplicated the tab: it copies the history) ⇒ { why: 'many' } — the last three keep
 * today's behaviour (a new tab of its own). PURE.
 */
function markVerdict({ candidates = [], carries = null } = {}) {
  const ids = (Array.isArray(candidates) ? candidates : []).map((x) => idKey(x)).filter(Boolean);
  if (!ids.length) return { why: 'none' };
  const m = carries instanceof Map ? carries : new Map();
  const read = ids.map((id) => (m.has(id) ? m.get(id) : null));
  if (read.some((v) => v !== true && v !== false)) return { why: 'unknown' };
  const yes = ids.filter((id, i) => read[i] === true);
  if (yes.length === 1) return { take: yes[0] };
  return { why: yes.length ? 'many' : 'none' };
}
/**
 * Row B-0e4a (主开发 r4282, the round's must — law L3): THE TAKE-BACK GIVES THE LEASE ITS ROOT, NEVER A WINDOW THAT HOLDS ANY PAGE
 * THAT IS NOT THE LEASE's. `windows` = a Map page target id → its window (null: not read inside the bound). The carrier's window is
 * the lease's own ONLY when it is read and NO other page sits in it and every other page's window was read (an unread one counts
 * as shared: it could be there). Else null ⇒ the tab is the root, the lease has no own window from it (its next tab gets one of
 * its own, as today). PURE.
 */
function ownWindowOf({ take = '', windows = null } = {}) {
  const m = windows instanceof Map ? windows : new Map();
  const id = idKey(take);
  const w = m.get(id);
  if (w == null) return null;
  for (const [k, v] of m) { if (idKey(k) === id) continue; if (v == null || v === w) return null; }
  return w;
}
/**
 * Row B-0e4a (主开发 r4312 / r4319, LAW A): EVERY READ FIRST, THEN AT MOST ONE ACT. The one carrier is taken back ONLY when it is
 * ALONE in its window and every page's window was read: → { take, window }. A window not read inside its bound (the carrier's or
 * any other page's) ⇒ { why: 'unknown' }; another page in the carrier's window ⇒ { why: 'shared' } (a tab a person put beside
 * their own tabs is theirs now; the lease's own later tabs cannot be told from theirs). Either way NOTHING is sent to the
 * carrier or its window. PURE.
 */
function aloneVerdict({ take = '', windows = null } = {}) {
  const m = windows instanceof Map ? windows : new Map();
  const id = idKey(take);
  if (!id || ![...m.keys()].some((k) => idKey(k) === id)) return { why: 'unknown' }; // the carrier's own window not read
  for (const v of m.values()) if (v == null) return { why: 'unknown' };
  const w = ownWindowOf({ take, windows: m });
  return w == null ? { why: 'shared' } : { take: idKey(take), window: w };
}
/**
 * Row B-0e4a (主开发 r4319, L2): THE MARK LEAVES THE HUB IN NO VIEW — the ONE helper every hub exit of a tab's address or title
 * passes (the live view's stream, both browser routers' replies, the keeper's broadcasts): the lease's marked blank — whole, or
 * cut short — reads as the plain blank a person would see (Chrome titles a blank page `about:blank`). `markOut` walks a reply
 * (copy-on-write: a value with no mark comes back AS IT IS, the same object); `markOutText` one serialized record. PURE.
 */
// 主开发 r4421 (1): the WHOLE mark (its 24 hex) is masked WHATEVER FOLLOWS it (law B: in no view); only a CUT-SHORT one needs the
// end-of-word test, so a page's own longer word that merely begins like it (`?q=…#vs-own-zz`) stays as it is
const MARK_ANY_RE = /about:blank#vs-own-(?:[0-9a-f]{24}|[0-9a-f]{0,23}(?![0-9a-z]))/gi;
const MARK_HINT_RE = /#vs-own-/i; // one cheap scan first: a record with no mark (every frame) comes back as it is
function markOutText(s) { return typeof s === 'string' && MARK_HINT_RE.test(s) ? s.replace(MARK_ANY_RE, 'about:blank') : s; }
function markOut(v, depth = 0) {
  if (typeof v === 'string') return markOutText(v);
  if (!v || typeof v !== 'object' || depth > 16) return v;
  if (Array.isArray(v)) { let out = null; for (let i = 0; i < v.length; i++) { const x = markOut(v[i], depth + 1); if (x !== v[i]) { out = out || v.slice(); out[i] = x; } } return out || v; }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return v; // a Buffer, a Date, a Map: no tab's address rides one
  let out = null;
  for (const k of Object.keys(v)) { const x = markOut(v[k], depth + 1); if (x !== v[k]) { out = out || { ...v }; out[k] = x; } }
  return out || v;
}
/** The ONE sentence the agent reads after a rebind (its command's answer, once): why its tab is gone, where it is bound now.
 *  `how` = `switched` (bound to the browser's only page) | `new` (a new tab of its own); `why` = `life` (the browser was
 *  restarted) | `closed` (the tab was closed) | `place` (B-9584 (B): the hold CLOSED it — its place could not be given to it in time,
 *  and a site on the profile's list would have read this machine's location there). */
const REBOUND_URL_MAX = 200;
function reboundNoteText({ how = 'new', url = '', why = 'life' } = {}) {
  const gone = why === 'closed' ? 'your tab was closed' : why === 'place' ? 'your tab was closed: this profile\'s place could not be given to it in time (a site on its list would have read this machine\'s location there)' : 'your tab from the previous run is gone (the browser was restarted)';
  // verify r1 (F8): the url is the PAGE's (a data: url keeps every character — a frame tag, a bidi override) and this note
  // is printed to the agent: THE belt (peer-text), as browser-kept's keptUrl and browser-stuck's loadingText — never a raw slice
  const u = PT.toAgentText(str(url), { kind: 'line', max: REBOUND_URL_MAX }).trim();
  // row B-0e4a: `back` — the lease's OWN tab came back with Chrome's restore and is bound again (its address never said: a page's)
  if (how === 'back') return 'the browser was restarted — your own tab came back with it and is bound again; re-read the page before continuing';
  return how === 'switched' ? `${gone} — bound to ${u || 'about:blank'}; re-read the page before continuing` : `${gone} — a new tab was opened and bound for you${u && u !== 'about:blank' ? ' (' + u + ')' : ''}; open your page again`;
}

module.exports = {
  OWN_MARK_RE, ownMarkUrl, markVerdict, ownWindowOf, aloneVerdict, OWN_BLANK_RE, isOwnBlank, markOut, markOutText, // row B-0e4a: a lease's own tab known again after a restart; the mark leaves the hub in no view
  unresponsiveAgentText, // lane browser-unresponsive
  TARGET_ID_RE, TAB_ID_RE, AGENT_TAB_ACTS, USER_TAB_ACTS, OWNER_WORDS, TAB_REFUSALS, MAX_ROOTS, MAX_USER_ACTS,
  pageTargets, cleanRoots, addRoot, tabOwners, ownSetOf, ownerWord,
  rebindPick, reboundNoteText, // lane profile-lock-roll L2: the rebind after a replaced browser
  parseTabArgv, resolveTabRef, newTabUrlVerdict, tabRow, agentTabView, agentTabVerdict,
  userTabVerdict, hostOf, chipTitle, chipTitleTail, tabRowModel, tabsStaleStep /* B-26bb */,
  isUrlTitle, pageTitleOf, titlesOf, pageRows, nameOfHolder, BLANK_URL_RE, // accept-fixes-strip F7 (the page's own title) + F8 (whose, by name)
  ownerMarkText, ownerTipText, tabRefusalText, userActsSentence, noteUserActIn, agentTabLines,
  tabGroups, tabsCountText, windowLabelText, isBlankTab, // lane browser-tabs-by-window: the tabs by window, a window's spare blank folded
  FRONT_READS_MAX, FRONT_STATES, frontVerdict, frontText, // B-e674 unit 1: the front of this view's window, said
  FRONT_READ_MS, frontNoteText, // B-e674 unit 2: one front read's bound; the unlisted foreign front's general line
  madeText, // B-e674 unit 2: the birth stamp in words
  takeoverStays, handbackStayText, handBackAnswerWords, // B-e674 follow (r694 (3)): the handback says what stays
};
