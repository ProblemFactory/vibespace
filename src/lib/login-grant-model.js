// WHO MAY HAVE A WEB LOGIN FILLED — THE GRANT DIALOGS' MODEL (the owner 2026-11-17: «这个界面逻辑有点问题 最上面那个选项会影响下面的表格
// 内容，容易引起困惑。另外这里配置apply之后似乎会直接对所有网站login生效？»). PURE — imports nothing; node-imported by
// scripts/test-login-grant-model.mjs. THE LAWS (主开发 19:53Z / 19:59Z):
//   · ONE DIALOG, ONE RESOURCE — a login's dialog is about THAT login (`origin#user`); nothing in it changes what its list means;
//   · a WIDER grant has its own door — «any account on a site» (`origin#*`) and «any site» (`*`), each its own dialog;
//   · WHAT IS TRUE IS SHOWN — a subject a wider row admits is drawn ticked AND locked, «through» that row, with its door: by the
//     hub's «by what» (src/browser-login.js byWhatOf — the fill's own rule), never a second test here;
//   · the house picker (src/lib/principal-picker.js) with «除了»; the store, the rule and the routes stay as they are.

/** The three grant scopes, narrowest first (= src/browser-login.js scopeOf). */
export const SCOPES = Object.freeze(['this-account', 'any-account', 'any-site']);
/** The picker's key for the All-agents row in these dialogs. */
export const EVERYONE_KEY = 'everyone:*';

/** The hub's subjects (GET /api/vault/web-logins `subjects`: running conversations with their Task Groups, the groups) → the house
 *  picker's rows (the same keys «by what» names: a conversation = `agent:<key>`, a group = `group:<id>`). */
export function rosterFromSubjects(subjects = {}) {
  const groups = ((subjects && subjects.groups) || []).map((g) => { const m = /^group:(.+)$/.exec(String((g && g.subject) || '')); return m ? { key: `group:${m[1]}`, kind: 'group', id: m[1], name: String(g.name || m[1]), groupIds: [], groupNames: [] } : null; }).filter(Boolean);
  const nameOfGroup = (id) => { const g = groups.find((x) => x.id === String(id)); return g ? g.name : String(id); };
  const sessions = ((subjects && subjects.sessions) || []).map((s) => {
    const m = /^session:(.+)$/.exec(String((s && s.subject) || ''));
    if (!m) return null;
    const gids = Array.isArray(s.groupIds) ? s.groupIds.map(String) : [];
    return { key: `agent:${m[1]}`, kind: 'agent', id: m[1], name: String(s.name || m[1].slice(0, 8)), backend: s.backend || 'claude', live: true, groupIds: gids, groupNames: gids.map(nameOfGroup) };
  }).filter(Boolean);
  return [...groups, ...sessions];
}

/** A principal key (the hub's spelling: `conversation:<key>` / `group:<id>` / `everyone`) → the picker's row key. */
export function pickKeyOf(principalKey, everyoneKey = EVERYONE_KEY) {
  const k = String(principalKey || '');
  if (k === 'everyone') return everyoneKey;
  if (k.startsWith('conversation:')) return `agent:${k.slice(13)}`;
  return k;
}
/** A grant model principal (`{kind, key|id}`) → the grant route's subject (`session:<key>` / `group:<id>` / `everyone`). */
export function subjectOf(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.kind === 'everyone') return 'everyone';
  if (p.kind === 'group' && p.id != null) return `group:${p.id}`;
  if (p.kind === 'conversation' && p.key != null) return `session:${p.key}`;
  return null;
}
/** A grant model principal → its principal key (the route's ungrant names it so). */
export function principalKeyOf(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.kind === 'everyone') return 'everyone';
  if (p.kind === 'group' && p.id != null) return `group:${p.id}`;
  if (p.kind === 'conversation' && p.key != null) return `conversation:${p.key}`;
  return null;
}

/** LAW 3 — in the dialog for `scope`, the subjects a WIDER scope admits (the hub's «by what»: key → every admitting scope, narrowest
 *  first): each ticked and locked, «through» the narrowest wider scope that admits it. → [{ key (picker key), principal, through }]. */
export function lockedFor(byWhat = {}, scope = 'this-account', everyoneKey = EVERYONE_KEY) {
  const at = SCOPES.indexOf(scope);
  const out = [];
  for (const [principal, scopes] of Object.entries(byWhat || {})) {
    const wider = (Array.isArray(scopes) ? scopes : []).filter((s) => SCOPES.indexOf(s) > at);
    if (wider.length) out.push({ key: pickKeyOf(principal, everyoneKey), principal, through: wider.sort((a, b) => SCOPES.indexOf(a) - SCOPES.indexOf(b))[0] });
  }
  return out;
}

/** THE ONE DRAWING of a grant dialog (主开发 00:28Z — after three rounds: ONE record per subject, drawn and nothing else). From the
 *  hub's «by what» (the fill's own verdict per subject) and the rows themselves (`rows` = { 'this-account', 'any-account', 'any-site' }
 *  → { to, except } in the grant model's spelling, null = none), for the dialog of `scope`:
 *  · `selected` — this row's OWN principals (ticked, removable); `also[k]` — the narrowest WIDER row that admits one of them too;
 *  · `exceptChips` — this row's own «除了»;
 *  · `locked` — a subject only a WIDER row admits: ticked and locked «through» it, with its door; `still` when THIS row leaves it out
 *    (a person who leaves D out here must see that D can still be filled — the owner's own confusion);
 *  · `everyone` — Everyone admitted by a wider row: ONE line, its row's exceptions named; the subjects it covers through that same
 *    row are not drawn one by one — never one this row leaves out (it stays a locked «still» line);
 *  · `leftOut[k]` — a subject NO row admits that a row holding Everyone leaves out (itself or its Task Group): marked with that row.
 *  `subjects` = [{ key: principal key, groupIds }]. PURE. */
export function drawPlan({ byWhat = {}, scope = 'this-account', rows = {}, subjects = [] } = {}) {
  const at = SCOPES.indexOf(scope);
  const keys = (list) => (Array.isArray(list) ? list : []).map(principalKeyOf).filter(Boolean);
  const here = rows[scope] || { to: [], except: [] };
  const held = new Set(keys(here.to)), exceptHere = new Set(keys(here.except));
  const ordered = (k) => SCOPES.filter((sc) => (Array.isArray(byWhat[k]) ? byWhat[k] : []).includes(sc));
  const wider = (k) => ordered(k).filter((sc) => SCOPES.indexOf(sc) > at);
  const exOf = (sc) => { const r = rows[sc]; return r && (r.to || []).some((p) => p && p.kind === 'everyone') ? keys(r.except) : []; };
  const outOf = (ex, k, groups) => ex.includes(k) || groups.some((g) => ex.includes(`group:${g}`));
  const evWide = wider('everyone')[0] || null;
  const plan = { scope, selected: [...held], exceptChips: [...exceptHere], locked: [], also: {}, leftOut: {}, everyone: evWide ? { through: evWide, except: exOf(evWide), own: held.has('everyone') } : null };
  for (const s of Array.isArray(subjects) ? subjects : []) {
    const k = String(s.key), groups = (s.groupIds || []).map(String), w = wider(k);
    if (held.has(k)) { if (w.length) plan.also[k] = w[0]; continue; }
    if (ordered(k).includes(scope)) continue;   // admitted HERE through a held Task Group or Everyone — that chip says it
    const outHere = outOf([...exceptHere], k, groups);
    if (w.length) {
      if (k !== 'everyone' && !outHere && plan.everyone && w[0] === plan.everyone.through && !outOf(plan.everyone.except, k, groups)) continue;   // under the Everyone line
      plan.locked.push({ key: k, through: w[0], still: outHere });
      continue;
    }
    const by = SCOPES.find((sc) => outOf(exOf(sc), k, groups));
    if (by) plan.leftOut[k] = by;
  }
  return plan;
}
/** WHAT A PERSON READS on the page drawn from `plan` about subject `s` — from the drawing alone: a locked line, a ticked chip, a
 *  «除了» chip, a held Task Group / Everyone, the Everyone line, a mark. → { admitted, through?, also?, leftOut? }. The walk in
 *  scripts/test-login-grant-model.mjs holds it equal to the fill's verdict for every small case. */
export function pageSays(plan, s) {
  const k = String(s.key), groups = (s.groupIds || []).map(String);
  const has = (list, x) => (list || []).includes(x);
  const lk = plan.locked.find((l) => l.key === k);
  if (lk) return { admitted: true, through: lk.through };
  if (has(plan.selected, k)) return { admitted: true, through: plan.scope, also: plan.also[k] || null };
  if (has(plan.exceptChips, k) || groups.some((g) => has(plan.exceptChips, `group:${g}`))) return { admitted: false, leftOut: plan.leftOut[k] || null };
  if (k !== 'everyone' && (has(plan.selected, 'everyone') || groups.some((g) => has(plan.selected, `group:${g}`)))) return { admitted: true, through: plan.scope };
  const evLine = plan.locked.find((l) => l.key === 'everyone');
  if (evLine && k !== 'everyone' && !has(plan.everyone.except, k) && !groups.some((g) => has(plan.everyone.except, `group:${g}`))) return { admitted: true, through: evLine.through };
  return { admitted: false, leftOut: plan.leftOut[k] || null };
}

/** The stored row of one resource among a login's reaching grants (`entry.grants`: {resource, scope, to, except}) → {to, except}. */
export function rowAt(grants = [], resource) {
  const g = (Array.isArray(grants) ? grants : []).find((x) => x && !x.unknown && x.resource === resource);
  return g ? { to: Array.isArray(g.to) ? g.to : [], except: Array.isArray(g.except) ? g.except : [] } : { to: [], except: [] };
}

/** WHAT SAVE SENDS (the same two routes as before): the stored row vs what the person picked ({to, except} in the grant model's
 *  spelling) → { grant: [{ subject, except? }], ungrant: [principalKey] }. A group's or Everyone's grant carries the row's exceptions
 *  (as subjects) whenever they changed or the subject is new. */
export function savePlan(stored = { to: [], except: [] }, picked = { to: [], except: [] }) {
  const keys = (list) => new Set((list || []).map(principalKeyOf).filter(Boolean));
  const had = keys(stored.to), want = keys(picked.to);
  const exceptSubjects = (picked.except || []).map(subjectOf).filter(Boolean).sort();
  const hadExcept = (stored.except || []).map(subjectOf).filter(Boolean).sort();
  const exceptChanged = JSON.stringify(exceptSubjects) !== JSON.stringify(hadExcept);
  const grant = [];
  for (const p of picked.to || []) {
    const k = principalKeyOf(p), s = subjectOf(p);
    if (!k || !s) continue;
    const wide = p.kind === 'group' || p.kind === 'everyone';
    if (!had.has(k)) grant.push(wide ? { subject: s, except: exceptSubjects } : { subject: s });
    else if (wide && exceptChanged) grant.push({ subject: s, except: exceptSubjects });
  }
  const ungrant = [...had].filter((k) => !want.has(k));
  return { grant, ungrant };
}

/** The sites the vault holds web logins for (the «any account on a site» door's choice), in order, once each. */
export function sitesOf(entries = []) {
  return [...new Set((Array.isArray(entries) ? entries : []).map((e) => String((e && e.origin) || '')).filter(Boolean))].sort();
}
/** The Web logins header's one line: what the wider rows hold — the star row's principals and the sites with an any-account row. */
export function wideSummary(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const star = new Map(), sites = new Set();
  for (const e of list) for (const g of (e && e.grants) || []) {
    if (!g || g.unknown) continue;
    if (g.resource === '*') for (const p of g.to || []) { const k = principalKeyOf(p); if (k && !star.has(k)) star.set(k, p); }
    if (/#\*$/.test(String(g.resource || '')) && (g.to || []).length) sites.add(String(g.resource).slice(0, -2));
  }
  return { anySite: [...star.values()], anyAccountSites: [...sites].sort() };
}
/** What a login holds besides its secret (the owner 2026-11-17: «比如绑定了哪个两步验证码»; 主开发 20:28Z: the bound two-step code
 *  first, by name or none; the slots it keeps named as kept, with when) — names and times, never a value, a seed or a code. */
export function heldFacts(entry = {}) {
  const e = entry || {};
  const pending = e.pending === 'register' || e.pending === 'change' ? e.pending : '';
  return { totpName: e.totpName ? String(e.totpName) : '', hasPrevious: !!e.hasPrevious, previousReplacedAt: Number(e.previousReplacedAt) || 0, pending, pendingCreatedAt: pending ? Number(e.pendingCreatedAt) || 0 : 0 };
}
