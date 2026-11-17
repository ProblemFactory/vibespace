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

/** WHAT THE DIALOG FOR `scope` DRAWS from «by what» (主开发 22:41Z, shoulds a and d) → { locked, also, covered }:
 *  · `also` — a subject that holds its OWN grant at this row AND a wider one: ticked and REMOVABLE here (its own grant is this row's,
 *    and it stays in force once the wider one goes), the «through» note beside it;
 *  · `locked` — a subject only a WIDER row admits: ticked and locked «through» it, with its door;
 *  · with Everyone held by a wider row, ONE line for Everyone — the subjects it covers through that same row are not drawn one by one
 *    (`covered` = how many); a subject through a narrower wider row keeps its own line. */
export function lockedPlan(byWhat = {}, scope = 'this-account', everyoneKey = EVERYONE_KEY) {
  const own = (p) => (Array.isArray((byWhat || {})[p]) ? byWhat[p] : []).includes(scope);
  const all = lockedFor(byWhat, scope, everyoneKey);
  const also = all.filter((l) => own(l.principal)), wide = all.filter((l) => !own(l.principal));
  const ev = wide.find((l) => l.principal === 'everyone');
  const locked = ev ? wide.filter((l) => l === ev || l.through !== ev.through) : wide;
  return { locked, also, covered: wide.length - locked.length };
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
