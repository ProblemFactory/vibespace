'use strict';
/** THE `registered` APP KIND (lane app-register-model, 2026-10-11 — owner: "你是不是应该提供一个注册表机制之类的让agent可以把它装
 *  的app注册到vibespace？包含启动方式（不同启动选项），卸载方式之类的？"): an app DECLARED rather than installed through a door —
 *  its launch variants (argv only: no shell string anywhere), its remove / reinstall recipes, the witness it matches. It lives
 *  in HOME (keeps 'home'). THE WITNESS-MATCH RULE (named in docs/design-app-persistence.zh.md): a declaration whose DEFAULT
 *  variant is something the machine already lists "Installed outside VibeSpace" (the same flatpak appId ⇒ `flatpak run
 *  <appId>`, or the same absolute Exec + args as a witnessed desktop entry) makes nothing new launchable ⇒ RECORDED DIRECTLY;
 *  any other declaration is ONE For-you click (a proposal, like an install). PURE, imports nothing; one line in index.js. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const BARE_RE = /^[A-Za-z0-9._+-]{1,128}$/;
const FLATPAK_ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){2,}$/; // = src/app-witness.js FLATPAK_ID_RE
const ROOT_WORDS = Object.freeze(['sudo', 'pkexec', 'doas', 'su', 'run0']);
const VARIANTS_MAX = 8, ARGS_MAX = 32, ARG_MAX = 256, ENV_MAX = 8, ICON_MAX = 1024 * 1024;
const CTRL_RE = /[\0-\x1f\x7f]/;
const named = (code, error) => ({ ok: false, code, error });
const slugOf = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'app';
const base = (x) => String(x || '').split('/').pop();
/** A recipe or a variant NAMING root (any word): refused — a registered app is the user's, nothing of it runs as root. */
const namesRoot = (argv) => argv.some((w) => ROOT_WORDS.includes(base(w)));
function argvOf(x, what) {
  if (!x || typeof x !== 'object') return named('bad_args', `${what} must be {exec, args}`);
  const exec = typeof x.exec === 'string' ? x.exec.trim() : '';
  if (!exec || exec.length > 4096 || CTRL_RE.test(exec) || !(exec.startsWith('/') || BARE_RE.test(exec))) return named('bad_exec', `${what}: exec must be an absolute path or a program name`);
  const args = x.args == null ? [] : x.args;
  if (!Array.isArray(args) || args.length > ARGS_MAX || !args.every((a) => typeof a === 'string' && a.length <= ARG_MAX && !a.includes('\0'))) return named('bad_args', `${what}: args must be ≤ ${ARGS_MAX} words of ≤ ${ARG_MAX} characters`);
  return { ok: true, exec, args: [...args] };
}
/** THE validation of a declaration (`entry` = the body minus id / by): `resolve(exec)` → the absolute path the USER would run
 *  (null = not found / not executable), `iconBytes(path)` → its size or null, `home` = the user's home, `engineIds` = the
 *  catalog / engine row ids (a slug that shadows one is refused), `entries` = the index's entries (another kind's id = shadow).
 *  → { ok, entry } (normalized; each variant carries its resolved `path`) | { ok:false, code, error } — codes by name:
 *  bad_label · bad_exec · bad_args · too_many_variants · needs_root · bad_icon · shadow. */
function validateRegistered(entry, { resolve = () => null, iconBytes = () => null, home = '', engineIds = [], entries = [] } = {}) {
  const e = entry && typeof entry === 'object' ? entry : {};
  const label = typeof e.label === 'string' ? e.label.trim() : '';
  if (!label || label.length > 80 || CTRL_RE.test(label)) return named('bad_label', 'label must be 1–80 characters on one line');
  if (!Array.isArray(e.launch) || !e.launch.length) return named('bad_args', 'launch must list 1–8 variants');
  if (e.launch.length > VARIANTS_MAX) return named('too_many_variants', `at most ${VARIANTS_MAX} launch variants (${e.launch.length} given)`);
  const launch = [], ids = new Set();
  for (const [i, v0] of e.launch.entries()) {
    const v = v0 && typeof v0 === 'object' ? v0 : {};
    const id = v.id == null || v.id === '' ? (i ? slugOf(v.label) : 'default') : String(v.id);
    if (!SLUG_RE.test(id) || ids.has(id)) return named('bad_args', `variant ${i + 1}: id must be a unique slug of ≤ 32 characters`);
    ids.add(id);
    const vl = v.label == null || v.label === '' ? (i ? id : 'Open') : String(v.label).trim();
    if (!vl || vl.length > 40 || CTRL_RE.test(vl)) return named('bad_label', `variant ${i + 1}: label must be 1–40 characters`);
    const a = argvOf(v, `variant ${id}`);
    if (!a.ok) return a;
    if (namesRoot([a.exec, ...a.args])) return named('needs_root', `variant ${id} names ${a.exec} — a registered app runs as you, never as root`);
    let env = null;
    if (v.env != null) {
      if (typeof v.env !== 'object' || Array.isArray(v.env) || Object.keys(v.env).length > ENV_MAX) return named('bad_args', `variant ${id}: env is ≤ ${ENV_MAX} NAME: value pairs`);
      env = {};
      for (const [k, x] of Object.entries(v.env)) { if (!ENV_RE.test(k) || typeof x !== 'string' || x.length > ARG_MAX || x.includes('\0')) return named('bad_args', `variant ${id}: env ${k.slice(0, 40)} is no NAME: value ≤ ${ARG_MAX}`); env[k] = x; }
    }
    if (v.cwd != null && (typeof v.cwd !== 'string' || !v.cwd.startsWith('/') || v.cwd.length > 4096 || CTRL_RE.test(v.cwd))) return named('bad_args', `variant ${id}: cwd must be an absolute path`);
    const p = resolve(a.exec);
    if (!p) return named('bad_exec', `variant ${id}: ${a.exec} does not resolve to a program you can run`);
    launch.push({ id, label: vl, exec: a.exec, args: a.args, ...(env ? { env } : {}), ...(v.cwd ? { cwd: v.cwd } : {}), path: p });
  }
  const recipes = {};
  for (const k of ['remove', 'reinstall']) {
    if (e[k] == null) continue;
    const a = argvOf(e[k], k);
    if (!a.ok) return a;
    if (namesRoot([a.exec, ...a.args])) return named('needs_root', `the ${k} recipe names ${[a.exec, ...a.args].find((w) => ROOT_WORDS.includes(base(w)))} — it runs as you on the owner's click; a recipe that needs root is refused`);
    if (k === 'remove' && !resolve(a.exec)) return named('bad_exec', `the remove recipe's ${a.exec} does not resolve to a program you can run`);
    recipes[k] = { exec: a.exec, args: a.args };
  }
  let icon = null;
  if (e.icon != null && e.icon !== '') {
    const ic = String(e.icon);
    const under = (home && ic.startsWith(`${home.replace(/\/+$/, '')}/`)) || ic.startsWith('/usr/share/');
    if (!under || !/\.(png|svg)$/i.test(ic) || ic.includes('/../') || CTRL_RE.test(ic)) return named('bad_icon', 'icon must be a .png / .svg under your home or /usr/share');
    const n = iconBytes(ic);
    if (n == null || n > ICON_MAX) return named('bad_icon', n == null ? `${ic} cannot be read` : `${ic} is larger than 1 MiB`);
    icon = ic;
  }
  let witness = null;
  if (e.witness != null && e.witness !== '') {
    const w = String(e.witness);
    if (!(/^flatpak:/.test(w) && FLATPAK_ID_RE.test(w.slice(8))) && !(/^desktop:\//.test(w) && w.length <= 4096 && !CTRL_RE.test(w))) return named('bad_args', 'witness is flatpak:<appId> or desktop:<absolute path>');
    witness = w;
  }
  const slug = slugOf(label);
  const engine = new Set((engineIds || []).map(String));
  if (engine.has(slug) || engine.has(`app.${slug}`)) return named('shadow', `${slug} is a catalog app's id — a registration never shadows it (choose another label)`);
  const same = (entries || []).find((x) => x && x.id === slug);
  if (same && same.kind !== 'registered') return named('shadow', `${slug} is already an app installed through VibeSpace (${same.kind}) — choose another label`);
  return { ok: true, entry: { kind: 'registered', label, launch, ...recipes, ...(icon ? { icon } : {}), witness, slug } };
}
/** The flatpak appId a variant runs (`flatpak run [--opts] <appId> …`), else null. */
function flatpakIdOf(v) {
  if (!v || base(v.exec) !== 'flatpak' || !Array.isArray(v.args) || v.args[0] !== 'run') return null;
  return v.args.slice(1).find((a) => !a.startsWith('-') && FLATPAK_ID_RE.test(a)) || null;
}
/** THE WITNESS-MATCH RULE. `entry` = a validated declaration, `seen` = the witnessed rows (src/app-witness.js; `path` = the
 *  resolved exec where the registry knows it). → { match: true, seen, witness } (recorded directly) | { match: false }. */
function witnessMatch(entry, seen = []) {
  const v = entry && entry.launch && entry.launch[0];
  if (!v) return { match: false };
  const fp = flatpakIdOf(v);
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  for (const r of seen || []) {
    if (!r || r.witnessed !== true) continue;
    if (fp && r.flatpak === fp && same(v.args, ['run', fp])) return { match: true, seen: r, witness: `flatpak:${fp}` };
    const rp = String(r.exec || '').startsWith('/') ? r.exec : r.path || null;
    if (!fp && rp && (rp === v.path || rp === v.exec) && same(v.args, r.args || [])) return { match: true, seen: r, witness: r.desktop ? `desktop:${r.desktop}` : null };
  }
  return { match: false };
}
/** The owner's Adopt (POST /api/desktop/apps/adopt): a witnessed row → the declaration it prefills. */
function adoptPrefill(r) {
  const row = r && typeof r === 'object' ? r : {};
  if (row.flatpak && FLATPAK_ID_RE.test(String(row.flatpak))) {
    return { label: String(row.label || row.flatpak).slice(0, 80), launch: [{ id: 'default', label: 'Open', exec: 'flatpak', args: ['run', row.flatpak] }],
      ...(row.source === 'flatpak-system' ? {} : { remove: { exec: 'flatpak', args: ['uninstall', '--user', '-y', row.flatpak] }, reinstall: { exec: 'flatpak', args: ['install', '--user', '-y', ...(row.remote ? [String(row.remote)] : []), row.flatpak] } }), witness: `flatpak:${row.flatpak}` }; // a system install's recipes need root: none
  }
  return { label: String(row.label || '').slice(0, 80), launch: [{ id: 'default', label: 'Open', exec: String(row.exec || ''), args: Array.isArray(row.args) ? [...row.args] : [] }], witness: row.desktop ? `desktop:${row.desktop}` : null };
}
/** The record reader (app-manifest normEntry): the variants, the recipes, the witness, who declared it. */
function record(e, { isObj, str, num }) {
  if (!Array.isArray(e.launch) || !e.launch.length) return { error: 'a registered entry lists its launch variants' };
  const launch = e.launch.slice(0, VARIANTS_MAX).filter((v) => isObj(v) && SLUG_RE.test(String(v.id || '')) && typeof v.exec === 'string' && v.exec).map((v) => ({ id: v.id, label: str(v.label, 40) || v.id, exec: v.exec.slice(0, 4096), args: (Array.isArray(v.args) ? v.args : []).map(String).slice(0, ARGS_MAX), ...(isObj(v.env) ? { env: Object.fromEntries(Object.entries(v.env).filter(([k, x]) => ENV_RE.test(k) && typeof x === 'string').slice(0, ENV_MAX)) } : {}), ...(typeof v.cwd === 'string' && v.cwd.startsWith('/') ? { cwd: v.cwd } : {}), ...(typeof v.path === 'string' ? { path: v.path.slice(0, 4096) } : {}) }));
  if (!launch.length) return { error: 'a registered entry lists its launch variants' };
  const rec = (x) => (isObj(x) && typeof x.exec === 'string' && x.exec ? { exec: x.exec.slice(0, 4096), args: (Array.isArray(x.args) ? x.args : []).map(String).slice(0, ARGS_MAX) } : null);
  const by = isObj(e.by) ? e.by : {};
  return { launch, ...(rec(e.remove) ? { remove: rec(e.remove) } : {}), ...(rec(e.reinstall) ? { reinstall: rec(e.reinstall) } : {}), ...(typeof e.icon === 'string' && e.icon.startsWith('/') ? { icon: e.icon } : {}), witness: typeof e.witness === 'string' ? e.witness.slice(0, 4096) : null,
    registered: { who: by.kind === 'agent' ? 'agent' : 'user', ...(str(e.registered && e.registered.session, 120) ? { session: str(e.registered.session, 120) } : {}), at: num(e.registered && e.registered.at) } };
}
/** The source word of its row: its witness's (the chip it kept), else 'registered'. */
const sourceOf = (e, home = '') => (!e.witness ? 'registered' : e.witness.startsWith('flatpak:') ? 'flatpak-user' : home && e.witness.startsWith(`desktop:${home}/`) ? 'desktop-user' : 'desktop-system');
/** THE row of an entry (variants[0] = the default; `launch` = every variant, the launch door picks one by id). */
function rowOf(e, { home = '' } = {}) {
  const v = e.launch[0];
  return { id: `app.${e.id}`, label: e.label || e.id, exec: v.exec, args: [...v.args], ...(v.env ? { env: { ...v.env } } : {}), ...(v.cwd ? { cwd: v.cwd } : {}), category: 'app', app: e.id,
    registered: true, removable: true, source: sourceOf(e, home), launch: e.launch.map((x) => ({ id: x.id, label: x.label, exec: x.exec, args: [...x.args], ...(x.env ? { env: { ...x.env } } : {}), ...(x.cwd ? { cwd: x.cwd } : {}) })),
    ...(e.icon ? { icon: e.icon } : {}), ...(e.witness && e.witness.startsWith('desktop:') ? { desktop: e.witness.slice(8) } : {}), ...(flatpakIdOf(v) ? { flatpak: flatpakIdOf(v) } : {}) };
}
const removeArgvOf = (e) => (e.remove ? [e.remove.exec, ...e.remove.args] : null);
const reinstallArgvOf = (e) => (e.reinstall ? [e.reinstall.exec, ...e.reinstall.args] : null);
/** The lines a person reads for a declaration (the For-you item, the card's Details): every argv verbatim, the resolved path. */
function commandLines(e, join) {
  const out = e.launch.map((v, i) => `${i ? v.label : `${v.label} (default)`}: ${join([v.exec, ...v.args])}${v.path && v.path !== v.exec ? `  [${v.path}]` : ''}`);
  if (e.remove) out.push(`remove: ${join(removeArgvOf(e))}`);
  if (e.reinstall) out.push(`reinstall: ${join(reinstallArgvOf(e))}`);
  return out;
}
const requestOf = (x) => (x && x.entry && typeof x.entry === 'object' ? { ok: true, request: { kind: 'registered', entry: x.entry } } : { ok: false, code: 'bad-request', error: 'a registration names its entry (label, launch, …)' });
const goneWords = (e) => (e.reinstall ? `reinstall: ${reinstallArgvOf(e).join(' ')}` : 'its program is gone — no reinstall recipe was registered');

module.exports = Object.freeze({ id: 'registered', entry: 'home', plan: true, request: true, agent: true, card: 'registered', keeps: 'home', from: 'none', word: 'registered app', doing: 'registering',
  record, requestOf, rowOf, removeArgvOf, reinstallArgvOf, goneWords, commandLines, validateRegistered, witnessMatch, adoptPrefill, flatpakIdOf, slugOf, sourceOf,
  ROOT_WORDS, VARIANTS_MAX, ICON_MAX });
