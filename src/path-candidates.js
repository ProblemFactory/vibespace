'use strict';
// PATH CANDIDATES (lane path-field — L1 of the New Session train; the owner accepted POC v2.2 on 2026-10-23 「没啥问题」).
// The one rule behind every field where a person types a folder (src/lib/path-field.js at every door) and the hub's answer
// to it (GET /api/dir-complete, the host rung): what the typed text MEANS as a path, and which folders to offer.
//   · resolveRelative — the resolution alone: a relative text against the bases IN ORDER (the selected Task Groups' folders
//     in selection order → the field's own context → the machine's home); every base that has it is a resolution, the
//     first is used; an absolute / ~ text against nothing; a link to a folder resolves to its target
//   · rankCandidates — the candidates, grouped: ① the Task Groups' folders (one absent on the chosen machine is greyed with
//     the create road, never dropped) ② 由名字 — <group folder>/<name> per SELECTED group in selection order + ~/<name> (a
//     bare typed word plays the name when the name is empty) ③ recent folders with counts ④ the listing under the typed
//     prefix / the whole-path fuzzy hits ⑤ mounts. Fuzzy over the WHOLE path: 片段前缀 (each word starts a segment, a word
//     in it, its initials, or an alias) > 子序列 > 词匹配, case-insensitive, CJK characters plain
//   · nameChips — the 由名字 chips under a field (`chips: true`, lane new-session-group-folder-link): the ② rows of the
//     Session Name alone, each marked 新建 when the machine does not have it; no name ⇒ none
//   · missingVerdict — «不存在 — 创建？»: a definite path that is not there; its parent missing ⇒ said, no create
//   · groupOn — a Task Group AS SEEN FROM ONE MACHINE: the folders that exist there (probed) or are declared for it
//     (`host::/path`), and the ones that are not (absent)
//   · isExcludedPath — never offered unasked (study round 4: a fresh pod PRESELECTED the product's own checkout): the
//     instance's own checkout, its data dir, dot-folders; a person who types such a path still gets it
// Aliases are general (never a rename table): a link pointing at a folder, the OS display names on a Mac, the owning Task
// Group's name. Words never live here: chips / whys / lines are `{ key, params }` and the field says them through t().
// Paths are kept in their `~/…` form for the machine they live on (listing.home is that machine's home).
// PURE: imports nothing (scripts/test-architecture.mjs PURE set) — the bundle and the hub share it.

const SEC = Object.freeze({ GROUP: 1, NAME: 2, RECENT: 3, DIR: 4, MOUNT: 5 });
const TIER = Object.freeze({ SEGMENT: 3, SUBSEQ: 2, TOKEN: 1 });
const HOST_ROW = /^([^:/\s]+)::(\/.*)$/;   // a Task Group folder declared for one machine (task-groups.js keeps `host::/path`)
const SELF_PACKAGE = 'vibespace';   // a folder whose package.json names this is an instance's own checkout (isExcludedPath's `self.roots`)

/* ── paths ── */
const baseName = (p) => (p === '~' ? '~' : String(p).split('/').pop());
const parentOf = (p) => (p === '~' || !String(p).includes('/') ? null : p.slice(0, p.lastIndexOf('/')) || '/');
const under = (p, root) => p === root || String(p).startsWith(root === '/' ? '/' : root + '/');
/** join + normalise ("." and ".." resolved, doubled slashes collapsed); a `~` base stays in `~` form */
function joinPath(b, rel) {
  const out = [];
  const head = String(b).startsWith('~') ? '~' : '';
  const parts = (head ? String(b).slice(1) : String(b)).split('/').concat(String(rel).split('/'));
  for (const s of parts) {
    if (!s || s === '.') continue;
    if (s === '..') { if (out.length) out.pop(); continue; }
    out.push(s);
  }
  return head ? (out.length ? '~/' + out.join('/') : '~') : '/' + out.join('/');
}
const toTilde = (home, p) => { const h = String(home || ''); const s = String(p || ''); return h && s === h ? '~' : h && s.startsWith(h + '/') ? '~' + s.slice(h.length) : s; };
const fromTilde = (home, p) => { const s = String(p || ''); return s === '~' ? String(home || '') : s.startsWith('~/') ? String(home || '') + s.slice(1) : s; };
const stripSlash = (p) => { const s = String(p || ''); return s.length > 1 ? s.replace(/\/+$/, '') || '/' : s; };

/** Never offered unasked: a dot-folder (any segment below the home / root starts with "."), the instance's own checkout and
 *  its data dir (`self.roots`, absolute). `path` in `~/…` or absolute form; `self.home` expands `~`. → 'dot' | 'self' | ''. */
function isExcludedPath(path, self) {
  const s = self || {};
  const abs = fromTilde(s.home, stripSlash(path));
  if (!abs) return '';
  const rel = s.home && (abs === s.home || abs.startsWith(s.home + '/')) ? abs.slice(s.home.length) : abs;
  if (rel.split('/').some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..')) return 'dot';
  for (const r of Array.isArray(s.roots) ? s.roots : []) { const root = stripSlash(r); if (root && root !== '/' && under(abs, root)) return 'self'; }
  return '';
}

const fileOf = (L, p) => { const par = parentOf(p); return par && L.dirs[par] ? (L.dirs[par].files || []).find((f) => f.name === baseName(p)) || null : null; };

/** THE RESOLUTION alone. `bases` = [{ path, label }] in order (home last); `files` = a file is a valid answer too.
 *  → { resolved: [{ path, base, kind: 'exact'|'file'|'link'|'complete', relative, via? }], missing: { path, base } | null,
 *      line: { key, params } } */
function resolveRelative(input, bases, listing, { files = false } = {}) {
  const L = listing || { dirs: {} };
  const dirs = L.dirs || {};
  const q = String(input == null ? '' : input).trim();
  const exists = (p) => !!dirs[p];
  const resolveIn = (lit, label, relative) => {
    const p = lit.replace(/\/+$/, '') || '~';
    if (exists(p)) return { path: p, base: label, kind: 'exact', relative };
    if (files && fileOf(L, p)) return { path: p, base: label, kind: 'file', file: true, relative };
    const t = L.links && L.links[p]; if (t && exists(t)) return { path: t, base: label, kind: 'link', via: p, relative };
    const par = parentOf(p);
    if (par && exists(par)) {
      const last = baseName(p).toLowerCase();
      const hits = (dirs[par].kids || []).filter((k) => k.toLowerCase().startsWith(last));
      const fh = files ? (dirs[par].files || []).filter((f) => f.name.toLowerCase().startsWith(last)) : [];
      if (hits.length + fh.length === 1) return { path: (par === '~' ? '~/' : par + '/') + (hits[0] || fh[0].name), base: label, kind: 'complete', file: !hits.length, relative };
    }
    return null;
  };
  const absLike = q.startsWith('/') || q.startsWith('~');
  const resolved = []; let missing = null;
  const bs = Array.isArray(bases) ? bases.filter((b) => b && b.path) : [];
  if (q && !/\s/.test(q)) {
    if (absLike) {
      const lit = q.startsWith('/') ? toTilde(L.home, q.replace(/\/+$/, '') || '/') : joinPath('~', q.slice(1));
      const r = resolveIn(lit, q.startsWith('/') ? 'abs' : 'home', false);
      if (r) resolved.push(r); else missing = { path: lit, base: q.startsWith('/') ? 'abs' : 'home' };
    } else {
      for (const b of bs) {
        const r = resolveIn(joinPath(b.path, q), b.label, true);
        if (r && !resolved.some((x) => x.path === r.path)) resolved.push(r);
      }
      /* an exact hit beats a completion: the completions drop out when one base has the folder itself */
      if (resolved.some((r) => r.kind !== 'complete')) for (let i = resolved.length - 1; i >= 0; i--) if (resolved[i].kind === 'complete') resolved.splice(i, 1);
      if (!resolved.length && bs.length) {
        /* where it WOULD be: the first base whose folder exists */
        const b = bs.find((x) => exists(parentOf(joinPath(x.path, q)) || '~')) || bs[0];
        missing = { path: joinPath(b.path, q), base: b.label };
      }
    }
  }
  const line = !q ? { key: 'empty', params: {} }
    : resolved.length > 1 ? { key: 'alts', params: { n: resolved.length, path: resolved[0].path, base: resolved[0].base } }
      : resolved.length ? { key: resolved[0].kind === 'complete' ? 'complete' : resolved[0].kind === 'link' ? 'link' : 'resolved', params: { path: resolved[0].path, base: resolved[0].base, relative: !!resolved[0].relative, via: resolved[0].via || '' } }
        : missing ? { key: 'missing', params: { path: missing.path, base: missing.base } }
          : { key: 'search', params: { text: q } };
  return { resolved, missing, line };
}

/** «不存在 — 创建？» — a definite path that is not there. → { path, parent, parentExists, line } */
function missingVerdict(path, listing) {
  const L = listing || { dirs: {} };
  const p = stripSlash(path);
  const parent = parentOf(p);
  const parentExists = !!(parent && L.dirs && L.dirs[parent]);
  return { path: p, parent, parentExists, line: parentExists ? { key: 'missing-create', params: { path: p } } : { key: 'missing-parent', params: { path: p, parent: parent || '' } } };
}

/** A Task Group AS SEEN FROM ONE MACHINE. `group.folders` = its folders in `~/…` form for THIS machine's home, a folder
 *  declared for one machine written `host::/abs`. Here (listing.machine empty) = its own folders without the declared
 *  ones; on a machine = the declared ones (no probe) + its folders that exist there (the listing carries the probe), and
 *  the ones that do not (absent — listed greyed, never dropped). */
function groupOn(group, listing) {
  const g = group || {};
  const L = listing || { dirs: {} };
  const dirs = L.dirs || {};
  const all = (Array.isArray(g.folders) ? g.folders : []).map(String);
  const local = all.filter((f) => !HOST_ROW.test(f));
  if (!L.machine) return { ...g, folders: local, declared: [], absent: [] };
  const declared = all.map((f) => f.match(HOST_ROW)).filter((m) => m && m[1] === L.machine).map((m) => toTilde(L.home, stripSlash(m[2])));
  const rest = local.filter((f) => !declared.includes(f));
  return { ...g, folders: declared.concat(rest.filter((f) => dirs[f])), declared, absent: rest.filter((f) => !dirs[f]), context: g.context && dirs[g.context] ? g.context : null };
}

/* fuzzy over one path. Tiers: 片段前缀 (each word starts a segment, a word in it, its initials or an alias — in order)
   > 子序列 (the letters in order) > 词匹配 (every word somewhere, any order). CJK characters are plain characters. */
function subseq(s, t) { let i = 0; for (const c of s) if (c === t[i]) i++; return i === t.length; }
function hlSubseq(disp, t, from) {
  if (!t) return null; const low = disp.toLowerCase(); const out = []; let j = 0;
  for (let i = from || 0; i < low.length && j < t.length; i++) if (low[i] === t[j]) { out.push(i); j++; }
  return j === t.length ? out : null;
}
function hlTail(p, n) { const st = p.length - baseName(p).length; const o = []; for (let i = 0; i < n; i++) o.push(st + i); return o; }
function fuzzyMatch(p, tokens, aliases) {
  const disp = p; const low = disp.toLowerCase();
  const segs = []; let off = 0;
  for (const s of disp.split('/')) { segs.push({ s, off }); off += s.length + 1; }
  const first = segs[0].s === '~' || segs[0].s === '' ? 1 : 0;
  const al = aliases || [];
  /* tier 3 */
  let at = first; const hl = []; const why = []; let ok = true; let lastSeg = false; let atStart = false; let usedAlias = null;
  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti]; let found = false;
    for (let si = at; si < segs.length && !found; si++) {
      const { s, off: so } = segs[si]; const sl = s.toLowerCase();
      const words = []; const re = /[^-_.\s]+/g; let mm;
      while ((mm = re.exec(s))) words.push({ w: mm[0], o: mm.index });
      if (sl.startsWith(tok)) { for (let i = 0; i < tok.length; i++) hl.push(so + i); why.push({ key: 'seg-start', params: { tok, seg: s } }); found = true; }
      else {
        const w = words.find((x) => x.w.toLowerCase().startsWith(tok));
        if (w) { for (let i = 0; i < tok.length; i++) hl.push(so + w.o + i); why.push({ key: 'seg-word', params: { tok, seg: s, word: w.w } }); found = true; }
        else if (tok.length >= 2 && words.length >= tok.length && words.slice(0, tok.length).map((x) => x.w[0].toLowerCase()).join('') === tok) {
          for (let i = 0; i < tok.length; i++) hl.push(so + words[i].o); why.push({ key: 'seg-initials', params: { tok, seg: s } }); found = true;
        }
      }
      if (found) { at = si; if (si === segs.length - 1) lastSeg = ti === tokens.length - 1 ? true : lastSeg; if (ti === 0 && si === segs.length - 1) atStart = true; }
    }
    if (!found) {
      const a = al.find((x) => x.text.toLowerCase().startsWith(tok));
      if (a && ti === tokens.length - 1) { why.push({ key: 'alias', params: { tok, alias: a.text, from: a.from } }); found = true; lastSeg = true; at = segs.length - 1; usedAlias = a; }
    }
    if (!found) { ok = false; break; }
  }
  if (ok) return { tier: TIER.SEGMENT, why, hl, lastSeg, atStart, alias: usedAlias };
  /* tier 2 */
  const joined = tokens.join('');
  const sub = hlSubseq(disp, joined, first ? 2 : 0);
  if (sub) return { tier: TIER.SUBSEQ, why: [{ key: 'subseq', params: { tok: joined } }], hl: sub, lastSeg: false };
  /* tier 1 */
  const hl1 = []; const why1 = []; let alias1 = null;
  for (const tok of tokens) {
    const i = low.indexOf(tok);
    if (i >= 0) { for (let k = 0; k < tok.length; k++) hl1.push(i + k); why1.push({ key: 'in-path', params: { tok } }); continue; }
    const a = al.find((x) => x.text.toLowerCase().includes(tok));
    if (a) { why1.push({ key: 'in-alias', params: { tok, alias: a.text, from: a.from } }); alias1 = a; continue; }
    return null;
  }
  return { tier: TIER.TOKEN, why: why1, hl: hl1, lastSeg: false, alias: alias1 };
}
const fuzzyTokens = (q) => String(q || '').toLowerCase().split(/[\s/]+/).filter(Boolean);

/** THE CANDIDATES. o = { bases, groups, recent, listing, name, machine, files, self }:
 *    bases   — [{ path, label }] in order (the selected groups' folders → the field's own context → home)
 *    groups  — [{ id, name, color, folders, context, selected, absent?, declared? }], selection order (groupOn applied
 *              here unless the caller already did — a row with `absent`)
 *    recent  — [{ path, count, when }] folders where conversations started (this machine)
 *    listing — the machine's world as far as it was seen { home, machine, dirs, links, localized, mounts }
 *    name    — the Session Name typed so far ('' = none) · machine — the machine's name for the words (null = here)
 *    files   — the field takes files too · self — the exclusion facts { home, roots } (isExcludedPath)
 *  → { mode, query, tokens, rows, sections: [{ sec, title, rows, more }], resolved, missing, best, nameRows, word, all } */
function rankCandidates(query, o) {
  const L = o.listing || { dirs: {} };
  const dirs = L.dirs || {};
  const q = String(query == null ? '' : query).trim();
  const host = o.machine || o.host || '';
  const exists = (p) => !!dirs[p];
  const isFile = (p) => !!(o.files && !dirs[p] && fileOf(L, p));
  const groups = (o.groups || []).map((g) => (Array.isArray(g.absent) ? g : groupOn(g, L)));
  const recent = o.recent || [];
  const self = o.self ? { home: o.self.home || L.home, roots: o.self.roots } : null;
  const excluded = (p) => !!(self && isExcludedPath(p, self));
  /* aliases: links pointing at a folder (~/合同 → contracts), the OS display names, the name of a group that owns it */
  const aliasesOf = (p) => {
    const out = [];
    for (const [lk, tg] of Object.entries(L.links || {})) if (tg === p) out.push({ text: baseName(lk), from: { key: 'link', params: { link: lk } } });
    if (L.localized && L.localized[p]) out.push({ text: L.localized[p], from: { key: 'os-name', params: {} } });
    for (const g of groups) if (g.folders.includes(p)) out.push({ text: g.name, from: { key: 'group-name', params: {} } });
    return out;
  };
  const recentOf = (p) => recent.find((r) => r.path === p) || null;
  const recentRank = (p) => recent.findIndex((r) => r.path === p);
  const groupOwning = (p) => groups.find((g) => g.folders.some((f) => under(p, f)) || (g.context && under(p, g.context))) || null;
  const mountOf = (p) => (L.mounts || []).find((m) => under(p, m)) || null;
  const mine = (p) => !!(recentOf(p) || groups.some((g) => g.folders.includes(p) || g.context === p));

  /* ── 1. RESOLUTION: what the typed text means as a path ── */
  const mode = !q ? 'empty' : (/^[~/.]/.test(q) || q.includes('/')) ? 'path' : 'fuzzy';
  const absLike = q.startsWith('/') || q.startsWith('~');
  const { resolved, missing } = resolveRelative(q, o.bases, L, { files: !!o.files });

  /* ── 2. CANDIDATES ── */
  const rows = []; const seen = new Set();
  const push = (r) => { if (seen.has(r.path)) return; seen.add(r.path); rows.push(r); };
  const meta = (p) => {
    const rc = recentOf(p); const g = groupOwning(p); const m = mountOf(p); const f = isFile(p); const d = dirs[p] || {};
    return { recent: rc, group: g, mount: m ? (dirs[m] && dirs[m].mount) || '' : '', exists: exists(p) || f, file: f, size: f ? fileOf(L, p).size : '', git: !!d.git, link: !!d.link };
  };
  /* where a candidate comes from = its section */
  const secOf = (p, nameHit) => {
    if (nameHit) return SEC.NAME;
    const g = groupOwning(p);
    if (g && (g.folders.includes(p) || g.context === p)) return SEC.GROUP;
    if (recentOf(p)) return SEC.RECENT;
    if (g) return SEC.GROUP;
    if (mountOf(p)) return SEC.MOUNT;
    return SEC.DIR;
  };
  const onHost = (g, p) => (!host ? '' : (g.declared || []).includes(p) ? 'declared' : 'there');
  const chipFor = (p, sec) => {
    const g = groupOwning(p); const rc = recentOf(p); const m = mountOf(p);
    if (sec === SEC.GROUP && g) {
      const gp = { group: g.name, color: g.color || '', host, on: onHost(g, p) };
      return g.context === p ? { key: 'notes', params: gp } : g.folders.includes(p) ? { key: 'group', params: gp } : { key: 'in-group', params: { group: g.name, color: g.color || '' } };
    }
    if (sec === SEC.RECENT && rc) return { key: 'recent', params: { count: rc.count, when: rc.when } };
    if (sec === SEC.MOUNT && m) return { key: 'mount', params: { mount: (dirs[m] && dirs[m].mount) || '' } };
    return { key: 'dir', params: {} };
  };

  /* name-derived (the owner's rule): <group folder>/<name> — one per SELECTED group, in selection order (each group has its
     own default folder) — and ~/<name>; an existing folder of that name first. The name is empty and a bare word is typed
     → the word plays the name (the same rows). */
  const nameRows = [];
  const word = !String(o.name || '').trim() && /^[^\s/~.][^\s/]*$/.test(q) ? q : '';
  const nm = String(o.name || '').trim().replace(/[\\/]+/g, '-') || word;
  if (nm) {
    const low = nm.toLowerCase();
    for (const p of Object.keys(dirs)) if (p !== '~' && baseName(p).toLowerCase() === low && !excluded(p)) nameRows.push({ path: p, why: { key: 'name-same', params: {} }, chip: { key: 'name-same', params: {} } });
    for (const g of groups.filter((x) => x.selected)) if (g.folders[0]) nameRows.push({ path: g.folders[0] + '/' + nm, why: { key: 'name-group', params: { group: g.name, word: !!word } }, chip: { key: 'name-group', params: { group: g.name, color: g.color || '' } }, g });
    nameRows.push({ path: '~/' + nm, why: { key: 'name-home', params: { host, word: !!word } }, chip: { key: 'name-home', params: { host } } });
  }

  const tokens = fuzzyTokens(q);
  if (mode === 'empty') {
    for (const g of groups) {
      for (const f of g.folders) push({ path: f, sec: SEC.GROUP, chip: chipFor(f, SEC.GROUP), ...meta(f), score: 0 });
      if (g.context) push({ path: g.context, sec: SEC.GROUP, chip: chipFor(g.context, SEC.GROUP), ...meta(g.context), score: 0 });
      /* a group folder that is not on this machine: greyed, with the create road — never silently dropped */
      for (const f of g.absent || []) push({ path: f, sec: SEC.GROUP, chip: { key: 'group', params: { group: g.name, color: g.color || '', host, on: '' } }, absent: true, why: { key: 'absent', params: { host } }, ...meta(f), isNew: true, score: 0 });
    }
    for (const n of nameRows) push({ path: n.path, sec: SEC.NAME, chip: n.chip, why: n.why, ...meta(n.path), isNew: !exists(n.path), score: 0 });
    for (const r of recent.slice(0, 5)) push({ path: r.path, sec: SEC.RECENT, chip: chipFor(r.path, SEC.RECENT), ...meta(r.path), score: 0 });
    for (const m of L.mounts || []) if (!excluded(m)) push({ path: m, sec: SEC.MOUNT, chip: chipFor(m, SEC.MOUNT), ...meta(m), score: 0 });
  } else if (mode === 'path') {
    /* ④ the directory listing under the typed prefix, for every base that has it */
    const dirPart = q.endsWith('/') ? q.replace(/\/+$/, '') : (q.includes('/') ? q.slice(0, q.lastIndexOf('/')) : '');
    const last = q.endsWith('/') ? '' : q.slice(q.lastIndexOf('/') + 1).toLowerCase();
    /* typed explicitly: a dot-folder once the segment starts with ".", the instance's own folders once their whole name is typed */
    const shown = (k) => { const why = excluded(k) ? isExcludedPath(k, self) : ''; return !why || mine(k) || (why === 'dot' ? last.startsWith('.') : baseName(k).toLowerCase() === last); };
    const parents = [];
    if (absLike) {
      const par = q.startsWith('/') ? toTilde(L.home, dirPart || '/') : joinPath('~', dirPart.slice(1));
      parents.push({ par, label: q.startsWith('/') ? 'abs' : 'home' });
    } else for (const b of o.bases || []) parents.push({ par: dirPart ? joinPath(b.path, dirPart) : b.path, label: b.label, relative: true });
    for (const { par, label, relative } of parents) {
      if (!exists(par)) continue;
      const kids = (dirs[par].kids || []).map((k) => (par === '~' ? '~/' + k : par === '/' ? '/' + k : par + '/' + k)).filter(exists).filter(shown);
      const pref = kids.filter((k) => baseName(k).toLowerCase().startsWith(last));
      const subs = last ? kids.filter((k) => !pref.includes(k) && subseq(baseName(k).toLowerCase(), last)) : [];
      const dirChip = { key: 'dir', params: { relative: relative ? label : '' } };
      for (const k of pref) push({ path: k, sec: SEC.DIR, chip: dirChip, rule: last ? 'prefix' : 'list', hl: hlTail(k, last.length), ...meta(k), score: 3000 - k.length });
      for (const k of subs) push({ path: k, sec: SEC.DIR, chip: dirChip, rule: 'subseq', hl: hlSubseq(k, last, k.length - baseName(k).length), ...meta(k), score: 2000 - k.length });
      /* a field that takes files lists the files too, after the folders */
      if (o.files) for (const f of (dirs[par].files || []).filter((x) => x.name.toLowerCase().startsWith(last) && (!x.name.startsWith('.') || last.startsWith('.')))) {
        const fp = (par === '~' ? '~/' : par === '/' ? '/' : par + '/') + f.name;
        push({ path: fp, sec: SEC.DIR, chip: { key: 'file', params: { size: f.size, relative: relative ? label : '' } }, rule: last ? 'prefix' : 'list', hl: hlTail(fp, last.length), ...meta(fp), score: 2500 - fp.length });
      }
      /* exactly one folder matched → show what is inside it too (Tab goes in) */
      if (pref.length === 1 && last && exists(pref[0])) for (const k of (dirs[pref[0]].kids || []).slice(0, 8)) {
        const kp = pref[0] + '/' + k; if (exists(kp) && shown(kp)) push({ path: kp, sec: SEC.DIR, sub: true, chip: { key: 'inside', params: {} }, ...meta(kp), score: 1000 - kp.length });
      }
    }
  } else {
    /* fuzzy over the WHOLE path of every folder the machine has shown */
    const all = Object.keys(dirs).filter((p) => p !== '~' && (!excluded(p) || mine(p)));
    for (const n of nameRows) if (!exists(n.path)) all.push(n.path);
    if (o.files) for (const d of Object.keys(dirs)) if (!excluded(d) || mine(d)) for (const f of dirs[d].files || []) if (!f.name.startsWith('.')) all.push((d === '~' ? '~/' : d + '/') + f.name);
    for (const p of all) {
      const m = fuzzyMatch(p, tokens, isFile(p) ? [] : aliasesOf(p));
      if (!m) continue;
      const nameHit = nameRows.find((n) => n.path === p);
      const sec = isFile(p) ? SEC.DIR : secOf(p, nameHit && !exists(p));
      const rc = recentOf(p); const rr = recentRank(p); const g = groupOwning(p);
      let score = m.tier * 1000 + (m.lastSeg ? 150 : 0) + (m.atStart ? 20 : 0);
      const boost = [];
      if (rc) { const b = Math.min(rc.count * 12, 96) + (rr >= 0 && rr < 3 ? 30 : 0); score += b; boost.push({ key: 'recent', params: { n: b } }); }
      if (g) { const b = g.selected ? (g.folders.includes(p) ? 80 : 40) : (g.folders.includes(p) ? 50 : 20); score += b; boost.push({ key: 'group', params: { n: b } }); }
      const depth = p.split('/').length - 1; score -= depth * 6;
      const there = exists(p) || isFile(p);
      if (!there) { score -= 60; boost.push({ key: 'missing', params: { n: -60 } }); } /* a folder that is there beats one that would be made */
      if (word && nameHit && !there) { score -= 3000; boost.push({ key: 'word-new', params: {} }); } /* the typed word always matches itself */
      const chip = sec === SEC.NAME ? nameHit.chip : isFile(p) ? { key: 'file', params: { size: fileOf(L, p).size, relative: '' } } : chipFor(p, sec);
      push({ path: p, sec, chip, rule: m.tier === TIER.SEGMENT ? 'segment' : m.tier === TIER.SUBSEQ ? 'subseq' : 'token', tier: m.tier, why: m.why, alias: m.alias || null, boost, hl: m.hl, ...meta(p), isNew: !there, score });
    }
  }

  /* group into sections; with a query the section holding the best hit goes first */
  const bySec = {};
  for (const r of rows) (bySec[r.sec] = bySec[r.sec] || []).push(r);
  for (const k of Object.keys(bySec)) if (+k !== SEC.NAME) bySec[k].sort((a, b) => b.score - a.score); /* ② keeps the selection order */
  const order = [1, 2, 3, 4, 5].filter((k) => bySec[k] && bySec[k].length);
  if (mode === 'fuzzy') order.sort((a, b) => bySec[b][0].score - bySec[a][0].score);
  const cap = mode === 'empty' ? 6 : 5;
  const capOf = (k) => (k === SEC.DIR && mode === 'path' ? 12 : cap);
  const sections = order.map((k) => ({ sec: k, title: { key: 'sec-' + k, params: { files: !!(k === SEC.DIR && o.files), word: !!(k === SEC.NAME && word) } }, rows: bySec[k].slice(0, capOf(k)), more: Math.max(0, bySec[k].length - capOf(k)) }));
  const flat = sections.flatMap((s) => s.rows);
  const best = mode === 'empty' ? null : flat.slice().sort((a, b) => b.score - a.score)[0] || null;
  return { mode, query: q, tokens, rows: flat, sections, resolved, missing, best, nameRows, word, all: rows.length };
}

/** The hub's side of the fuzzy search: which of `paths` (a machine's folder index, `~/…` form) match `q` at all, best
 *  first, at most `limit` — the same fuzzyMatch the field ranks with (segment prefix > subsequence > token). */
function fuzzyFilter(paths, q, { limit = 60, aliases = null } = {}) {
  const tokens = fuzzyTokens(q);
  if (!tokens.length) return [];
  const out = [];
  for (const p of paths || []) {
    const m = fuzzyMatch(p, tokens, aliases ? aliases(p) : []);
    if (m) out.push({ path: p, s: m.tier * 1000 + (m.lastSeg ? 150 : 0) - p.split('/').length * 6 });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.path);
}

/** THE SLICE: a machine's raw folder facts → the listing the field ranks over (one implementation for this machine's
 *  SafeFs answer and a remote machine's rung). Raw facts, absolute paths on that machine:
 *    dirs    — [{ path, exists, isDir, mtime, git, kids: [{ name, git, link? }], files?, fileCount, more }] (listed)
 *    probes  — [{ path, exists, isDir, mtime, git, fileCount }] (stated only)
 *    index   — { dirs: [path], links: [{ from, to }] } the folder index the fuzzy `q` searches (best `limit` kept)
 *    mounts  — [{ path, label }] · localized — { path: display name } (the OS's names on a Mac)
 *  A symlink to a folder is a LINK (an alias of its target, which is kept), never a second row.
 *  → { home, machine, dirs: { '~/…': entry }, links, localized, mounts } (entry: kids/files/git/fileCount/mtime/more,
 *    `stub` = known to exist, not listed) */
function sliceListing({ home, machine = null, dirs = [], probes = [], index = null, mounts = [], localized = {}, q = '', limit = 60 } = {}) {
  const T = (p) => toTilde(home, stripSlash(p));
  const kid = (tp, name) => (tp === '~' ? '~/' + name : tp === '/' ? '/' + name : tp + '/' + name);
  const out = { home: home || '', machine: machine || null, dirs: {}, links: {}, localized: {}, mounts: [], nondirs: {} };
  const stub = (tp) => { if (!out.dirs[tp]) out.dirs[tp] = { stub: true }; return out.dirs[tp]; };
  const link = (from, to) => { const f = T(from); const t = T(to); if (!t || f === t) return; out.links[f] = t; stub(t); };
  for (const d of dirs || []) {
    if (!d || !d.exists || d.isDir === false || !Array.isArray(d.kids)) continue;
    const tp = T(d.path);
    const e = { kids: [], git: !!d.git, fileCount: d.fileCount == null ? null : d.fileCount, mtime: d.mtime || 0, more: !!d.more };
    if (Array.isArray(d.files)) e.files = d.files.map((f) => ({ name: f.name, size: f.size, mtime: f.mtime }));
    for (const k of d.kids) {
      if (!k || !k.name) continue;
      if (k.link) { link(kid(d.path, k.name), k.link); continue; }
      e.kids.push(k.name);
      const s2 = stub(kid(tp, k.name)); if (k.git) s2.git = true;
    }
    out.dirs[tp] = Object.assign(out.dirs[tp] && out.dirs[tp].stub ? out.dirs[tp] : {}, e, { stub: false });
  }
  for (const p of probes || []) {
    if (p && p.exists && p.isDir === false) { out.nondirs[T(p.path)] = true; continue; }   // there, but a file
    if (!p || !p.exists) continue;
    const e = stub(T(p.path));
    if (p.git) e.git = true;
    if (p.fileCount != null) e.fileCount = p.fileCount;
    if (p.mtime) e.mtime = p.mtime;
  }
  if (index && Array.isArray(index.dirs)) {
    for (const l of index.links || []) if (l && l.from && l.to) link(l.from, l.to);
    const byTarget = {};
    for (const [f, t] of Object.entries(out.links)) (byTarget[t] = byTarget[t] || []).push({ text: baseName(f), from: { key: 'link', params: { link: f } } });
    const tl = index.dirs.map(T).concat(Object.keys(byTarget));
    for (const hit of fuzzyFilter(tl, q, { limit, aliases: (p2) => byTarget[p2] || [] })) stub(hit);
  }
  for (const m of mounts || []) {
    if (!m || !m.path) continue;
    const tp = T(m.path);
    stub(tp).mount = String(m.label || baseName(tp));
    if (!out.mounts.includes(tp)) out.mounts.push(tp);
  }
  for (const [p, name] of Object.entries(localized || {})) if (name && baseName(T(p)) !== name) out.localized[T(p)] = String(name);
  return out;
}

/** The field's per-machine memory of every slice it was answered: a listed entry replaces, a stub never erases a listing. */
function mergeListing(into, slice) {
  const L = into && into.dirs ? into : { home: '', machine: null, dirs: {}, links: {}, localized: {}, mounts: [], nondirs: {} };
  if (!slice) return L;
  if (slice.home) L.home = slice.home;
  if (slice.machine !== undefined) L.machine = slice.machine;
  for (const [p, e] of Object.entries(slice.dirs || {})) {
    const had = L.dirs[p];
    if (!had || !e.stub) L.dirs[p] = { ...(had || {}), ...e };
    else for (const k of ['git', 'fileCount', 'mtime', 'mount', 'link']) if (e[k] != null && e[k] !== false) had[k] = e[k];
  }
  Object.assign(L.links, slice.links || {});
  Object.assign(L.localized, slice.localized || {});
  L.nondirs = Object.assign(L.nondirs || {}, slice.nondirs || {});
  for (const m of slice.mounts || []) if (!L.mounts.includes(m)) L.mounts.push(m);
  return L;
}

/** What the field asks a machine for one text (the hub lists / states exactly these): the folders to LIST (each base, the
 *  typed text's parent against each base — or the absolute parent — and the home) and whether to search the index.
 *  `bases` = [{ path }] in `~/…` form; → { list: ['~/…'], fuzzy: bool } */
function sliceAsk(text, bases) {
  const q = String(text == null ? '' : text).trim();
  const list = ['~'];
  const add = (p) => { if (p && !list.includes(p)) list.push(p); };
  for (const b of bases || []) if (b && b.path) add(stripSlash(b.path));
  const pathLike = /^[~/.]/.test(q) || q.includes('/');
  if (q && pathLike && !/\s/.test(q)) {
    const dirPart = q.endsWith('/') ? q.replace(/\/+$/, '') : (q.includes('/') ? q.slice(0, q.lastIndexOf('/')) : '');
    if (q.startsWith('/')) add(dirPart || '/');
    else if (q.startsWith('~')) add(joinPath('~', dirPart.slice(1)));
    else for (const b of bases || []) if (b && b.path) add(dirPart ? joinPath(b.path, dirPart) : stripSlash(b.path));
  }
  return { list, fuzzy: !!q && !pathLike };
}

/** The old dir-complete answer out of a slice: the folders under the typed parent starting with the typed last segment
 *  (absolute, ≤ 20) — `suggestions` stays answered for every caller that still reads it. */
function legacySuggestions(listing, text) {
  const L = listing || {};
  const t = String(text || '');
  const slash = t.lastIndexOf('/');
  if (slash < 0 || !L.dirs) return [];
  const par = toTilde(L.home, fromTilde(L.home, t.slice(0, slash) || '/'));
  const prefix = t.slice(slash + 1).toLowerCase();
  const d = L.dirs[par];
  if (!d || !Array.isArray(d.kids)) return [];
  return d.kids.filter((k) => (!k.startsWith('.') || prefix.startsWith('.')) && k.toLowerCase().startsWith(prefix)).slice(0, 20)
    .map((k) => fromTilde(L.home, par === '~' ? '~/' + k : par === '/' ? '/' + k : par + '/' + k));
}

/** A machine's recent folders WITH COUNTS (GET /api/hosts/:id/recent-cwds): its discovered sessions → how many started
 *  in each folder there and the newest (ms; a seconds mtime is scaled) — newest first, ≤ limit. */
function recentCounts(sessions, limit = 20) {
  const by = new Map();
  for (const s of sessions || []) {
    if (!s || !s.cwd) continue;
    const m = Number(s.mtime) || 0; const ms = m && m < 1e12 ? m * 1000 : m;
    const c = by.get(s.cwd) || { path: s.cwd, count: 0, last: 0 };
    c.count++; if (ms > c.last) c.last = ms; by.set(s.cwd, c);
  }
  return [...by.values()].sort((a, b) => b.last - a.last || b.count - a.count).slice(0, limit);
}

/** THE 由名字 CHIPS under a field (lane new-session-group-folder-link — the owner: 「按照任务名推荐 path 也没有，必须点开 path
 *  autocomplete 列表才行」): one `<group folder>/<name>` per SELECTED group in selection order, then `~/<name>` — the ② rows
 *  of the Session Name alone (a typed word never plays the name here; the same-name folder stays a list row), each `isNew`
 *  when the machine does not have it (made only at use, with the tick). o = rankCandidates' { groups, listing, name, machine }.
 *  → [{ path, isNew, group: { id, name, color } | null, why }] — the name empty ⇒ []. */
function nameChips(o = {}) {
  const L = o.listing || { dirs: {} };
  const m = rankCandidates('', { ...o, bases: [], recent: [], listing: L });
  return m.nameRows.filter((n) => n.chip.key !== 'name-same')
    .map((n) => ({ path: n.path, isNew: !(L.dirs || {})[n.path], group: n.g ? { id: n.g.id, name: n.g.name, color: n.g.color || '' } : null, why: n.why }));
}

module.exports = {
  SEC, TIER, HOST_ROW, SELF_PACKAGE,
  baseName, parentOf, under, joinPath, toTilde, fromTilde, isExcludedPath,
  resolveRelative, missingVerdict, groupOn, rankCandidates, fuzzyMatch, fuzzyFilter, fuzzyTokens, subseq,
  sliceListing, mergeListing, sliceAsk, legacySuggestions, recentCounts, nameChips,
};
