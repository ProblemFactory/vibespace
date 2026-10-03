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
const USER_TAB_ACTS = Object.freeze(['switch', 'close']);
/** Whose a tab is, from the VIEW's side: the viewed conversation's (`agent`), the user's own (`you`), another
 *  conversation's (`other`), nobody's (`orphan`). */
const OWNER_WORDS = Object.freeze(['agent', 'you', 'other', 'orphan']);
/** Every refusal a tab act can answer (the routes' STATUS rows and the census read this). */
const TAB_REFUSALS = Object.freeze(['not_your_tab', 'tabs_unreadable', 'no_such_tab', 'take_over_first', 'last_tab', 'mediated_tabs', 'not_web', 'bad-request']);
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
  if (act === 'switch') return active ? { ok: true, via: 'lease', noop: true } : { ok: true, via: 'lease' };
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
const BLANK_URL_RE = /^(?:about:blank|chrome:\/\/(?:newtab|new-tab-page)\/?|)$/i;
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
 */
function tabRowModel({ tabs = [], owners = {}, viewer = {}, driving = false, mediated = false, adoptable = false, titles = {}, names = {} } = {}, tIn) {
  const t = tOf(tIn);
  const human = !!(viewer && viewer.human);
  const ow = isObj(owners) ? owners : {};
  const wordOf = (x) => { const w = str(ow[idKey(x.targetId)] || ow[str(x.targetId)]); return OWNER_WORDS.includes(w) ? w : 'orphan'; };
  const tt = isObj(titles) ? titles : {}, nm = isObj(names) ? names : {};
  // accept-fixes-strip F7: the PAGE's title (CDP's, else the binary's — never an address dressed as one); F8: a blank
  // tab nobody holds is not drawn (the tab on show always is)
  const list = (Array.isArray(tabs) ? tabs : []).filter((x) => isObj(x) && isTargetId(x.targetId))
    .map((x) => ({ ...x, title: pageTitleOf(x, tt[idKey(x.targetId)]) }))
    .filter((x) => x.active || wordOf(x) !== 'orphan' || !BLANK_URL_RE.test(str(x.url).trim()));
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
    return {
      targetId: idKey(x.targetId), tabId: str(x.tabId), title: twin.has(plain[i]) ? chipTitleTail(x.title, x.url) : plain[i], tip: full === url ? full : `${full} — ${url}`, url, host: hostOf(x.url), active: !!x.active, owner,
      mark: ownerMarkText(owner, { human, name: nameOfHolder(nm[idKey(x.targetId)]) }, tIn), markTip: ownerTipText(owner, { human, name: nameOfHolder(nm[idKey(x.targetId)]) }, tIn),
      // accept-fixes F4: the tab the agent is WORKING ON says so on its chip (never only a border) — apart from the one
      // this view watches (the dashed chip)
      here: owner === 'agent' && !!x.active, hereText: owner === 'agent' && x.active ? t('The agent is here') : '',
      canSwitch: sw.ok && !sw.noop, canClose: cl.ok,
      switchTip: sw.ok && !sw.noop ? t('Switch to this tab') : '', closeTip: cl.ok ? t('Close tab') : '',
    };
  });
  return { rows, counts, anyAgent: counts.agent > 0 };
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
/** Every refusal's words. `f.agent` = the agent-facing sentence (never t()-wrapped by the server). */
function tabRefusalText(code, f = {}, tIn) {
  const t = f && f.agent ? fill : tOf(tIn);
  switch (code) {
    case 'not_your_tab':
      if (f && f.agent) return 'that tab is not yours — it belongs to another holder of this browser (another conversation, or the user); you list, switch to and close only your own tabs (`vibespace-browser tab list`)';
      if (f && f.yours) return t('Switch to your own tab from your browsing window');
      if (f && f.orphan) return t('Nobody’s tab — open Browse yourself on this profile to take it');
      return t('Another conversation’s — open its live view to use it');
    case 'tabs_unreadable': return f && f.agent ? 'the browser\'s tabs could not be read just now — nothing ran; run the command again' : t('The tabs could not be read just now — try again');
    case 'no_such_tab': return t('That tab is gone');
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
  const list = (Array.isArray(acts) ? acts : []).filter((a) => isObj(a) && (a.kind === 'tab-close' || a.kind === 'tab-switch'));
  if (!list.length) return '';
  const q = (a) => { const ti = str(a.title).trim().slice(0, 80), u = str(a.url).slice(0, 200); return `“${ti && u ? ti + ' — ' + u : (ti || u || 'a tab')}”`; };
  const closed = list.filter((a) => a.kind === 'tab-close');
  const sw = [...list].reverse().find((a) => a.kind === 'tab-switch');
  const parts = [];
  if (closed.length) parts.push(`closed ${closed.length === 1 ? 'one of your tabs' : closed.length + ' of your tabs'} (${closed.slice(0, 6).map(q).join(', ')}${closed.length > 6 ? `, and ${closed.length - 6} more` : ''})`);
  if (sw) parts.push(`switched your current tab to ${q(sw)}`);
  return `While driving, the user ${parts.join(' and ')}.`;
}
/** One user act on the cycle's list (bounded, newest kept). */
function noteUserActIn(list, act) {
  const a = isObj(act) && (act.kind === 'tab-close' || act.kind === 'tab-switch') ? { kind: act.kind, title: str(act.title).slice(0, 300), url: str(act.url).slice(0, 2048), at: Number(act.at) || 0 } : null;
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
  return { targetId: only.targetId, url: str(raw.url) || 'about:blank' };
}
/** The ONE sentence the agent reads after a rebind (its command's answer, once): why its tab is gone, where it is bound now.
 *  `how` = `switched` (bound to the browser's only page) | `new` (a new tab of its own); `why` = `life` (the browser was
 *  restarted) | `closed` (the tab was closed). */
const REBOUND_URL_MAX = 200;
function reboundNoteText({ how = 'new', url = '', why = 'life' } = {}) {
  const gone = why === 'closed' ? 'your tab was closed' : 'your tab from the previous run is gone (the browser was restarted)';
  // verify r1 (F8): the url is the PAGE's (a data: url keeps every character — a frame tag, a bidi override) and this note
  // is printed to the agent: THE belt (peer-text), as browser-kept's keptUrl and browser-stuck's loadingText — never a raw slice
  const u = PT.toAgentText(str(url), { kind: 'line', max: REBOUND_URL_MAX }).trim();
  return how === 'switched' ? `${gone} — bound to ${u || 'about:blank'}; re-read the page before continuing` : `${gone} — a new tab was opened and bound for you${u && u !== 'about:blank' ? ' (' + u + ')' : ''}; open your page again`;
}

module.exports = {
  TARGET_ID_RE, TAB_ID_RE, AGENT_TAB_ACTS, USER_TAB_ACTS, OWNER_WORDS, TAB_REFUSALS, MAX_ROOTS, MAX_USER_ACTS,
  pageTargets, cleanRoots, addRoot, tabOwners, ownSetOf, ownerWord,
  rebindPick, reboundNoteText, // lane profile-lock-roll L2: the rebind after a replaced browser
  parseTabArgv, resolveTabRef, newTabUrlVerdict, tabRow, agentTabView, agentTabVerdict,
  userTabVerdict, hostOf, chipTitle, chipTitleTail, tabRowModel,
  isUrlTitle, pageTitleOf, titlesOf, pageRows, nameOfHolder, BLANK_URL_RE, // accept-fixes-strip F7 (the page's own title) + F8 (whose, by name)
  ownerMarkText, ownerTipText, tabRefusalText, userActsSentence, noteUserActIn, agentTabLines,
};
