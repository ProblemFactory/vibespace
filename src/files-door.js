// THE FILES DOOR's verdicts (lane phone-files-door, 2026-10-24 — the owner: 「我发现手机上好像不是很容易找到文件管理器」; the
// phone's doors census is PURE src/phone-doors.js). The client draws them (src/lib/phone-files.js):
//   · filesCardChips — the 文件 card's chips on the phone's For-you page: home first, the last folder used, the home's
//     folders with files, the mounted mounts, the home's other folders, the recent folders — a path once, bounded.
//   · crumbsOf — a folder as breadcrumbs (~ for the home), each with the folder it opens.
// PURE: imports only ./day-one.js (PURE → PURE); the bundle and its suite share it.
const { folderChips } = require('./day-one.js');

const CARD_MAX = 8; // chips after the home's

const norm = (p) => { const s = String(p == null ? '' : p).trim(); return s.length > 1 ? s.replace(/\/+$/, '') : s; };

/** THE 文件 CARD's chips. `home` = this machine's home, `folders` = GET /api/home-folders' folders, `recent` = this
 *  machine's session folders newest first, `mounts` = GET /api/mounts' mounts ({ name, path, mounted }). → [{ path,
 *  kind: 'home' | 'last' | 'files' | 'mount' | 'folder' | 'recent', name?, files?, more?, last? }] — home first, a path
 *  once, at most `max` chips after it. */
function filesCardChips({ home = '', folders = [], recent = [], mounts = [], max = CARD_MAX } = {}) {
  const h = norm(home);
  const out = [];
  const seen = new Set();
  if (h) { out.push({ path: h, kind: 'home' }); seen.add(h); }
  const rec = (Array.isArray(recent) ? recent : []).map(norm).filter((p) => p && p !== h);
  const base = folderChips({ folders, recent: rec, max: Number.MAX_SAFE_INTEGER }).filter((c) => !seen.has(c.path));
  const ms = (Array.isArray(mounts) ? mounts : []).filter((m) => m && m.mounted && m.path).map((m) => ({ path: norm(m.path), kind: 'mount', name: String(m.name || '') || norm(m.path).split('/').pop() }));
  // the order a person reaches for: the last one used, the folders that hold their files, their mounts, the rest
  const lead = base.filter((c) => c.last);
  const files = base.filter((c) => !c.last && c.kind === 'files');
  const rest = base.filter((c) => !c.last && c.kind !== 'files');
  let n = 0;
  for (const c of [...lead, ...files, ...ms, ...rest]) {
    if (n >= max) break;
    if (!c.path || seen.has(c.path)) continue;
    seen.add(c.path); out.push(c); n++;
  }
  return out;
}

/** A folder as breadcrumbs: [{ label, path }] from the root the person knows — `~` for (a folder under) `home`, else `/`.
 *  The last crumb is the folder itself. '' ⇒ []. */
function crumbsOf(dir, home = '') {
  const p = norm(dir), h = norm(home);
  if (!p) return [];
  if (h && h !== '/' && (p === h || p.startsWith(h + '/'))) {
    const out = [{ label: '~', path: h }];
    let at = h;
    for (const seg of p.slice(h.length).split('/').filter(Boolean)) { at += '/' + seg; out.push({ label: seg, path: at }); }
    return out;
  }
  const out = [{ label: '/', path: '/' }];
  let at = '';
  for (const seg of p.split('/').filter(Boolean)) { at += '/' + seg; out.push({ label: seg, path: at }); }
  return out;
}

module.exports = { CARD_MAX, filesCardChips, crumbsOf };
