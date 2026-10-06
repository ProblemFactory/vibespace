'use strict';
/** THE `deb` APP KIND — a .deb file the user had (or VibeSpace fetched): its bytes copied into the repo, BOUND BY ITS
 *  SHA256 (`fileBound`: the file names its package, a changed file is refused), installed by root through the package
 *  slot. PURE, imports nothing; one line in src/app-kinds/index.js (lane dc-app-kinds). */
/** THE PLAN of a .deb file — the machine half's plan body for it, moved verbatim out of src/app-serve.js plan() (lane
 *  dc-app-kinds). `c` = the plan context src/app-serve.js hands every kind (the request p, the machine facts f, the
 *  index, the nonce, the runner, the simulations, `ret` …); answers THE plan or a named refusal. */
async function planner(c) {
  const { p, f, kind, manifest, nonce, intoSys, ret, simOpts, moveTail, A, appsDir, both, env, runner, fsp, path, DEB_MAX, entryIdFor, twinOf, sys, stage, stagedFile, readHashed, debApp } = c;
  const own = p.staged != null; // design 009: an installer VibeSpace fetched / copied at propose time — planned IN PLACE, bound by its sha256
  let file, st, staged, sha256;
  if (own) {
    const sf = await stagedFile(p, '.deb');
    if (sf.error) return ret({ ...sf.error, kind });
    staged = sf.file; sha256 = p.sha256; st = { size: sf.size }; file = `/${String(p.name || 'package.deb').replace(/[^A-Za-z0-9@._+-]+/g, '-').slice(0, 120)}`;
  } else {
    file = String(p.debPath || '');
    if (!path.isAbsolute(file) || !/\.deb$/.test(file)) return ret({ ok: false, code: 'bad_name', error: 'name a .deb file by its absolute path on this machine', kind });
    try { st = await fsp.stat(file); } catch (e) { return ret({ ok: false, code: 'not_found', error: `${file} cannot be read on this machine (${e.code === 'ENOENT' ? 'no such file' : e.message})`, kind }); }
    if (!st.isFile() || st.size > DEB_MAX) return ret({ ok: false, code: 'bad_name', error: `${file} is not a regular file under ${A.fmtBytes(DEB_MAX)}`, kind });
    staged = await stage(Buffer.alloc(0), 'deb');
    try { ({ sha256 } = await readHashed(file, staged, DEB_MAX)); } catch (e) { await fsp.rm(staged, { force: true }); return ret({ ok: false, code: 'bad_name', error: e.code === 'bad_name' ? e.message : `${file} cannot be read on this machine (${e.message})`, kind }); }
    if (p.sha256 != null && sha256 !== p.sha256) { await fsp.rm(staged, { force: true }); return ret({ ok: false, code: 'deb_changed', error: `the saved ${path.basename(file)} is not the file that was installed (its sha256 changed) — it is not moved`, kind }); } // design 019 M2: a move's cached .deb, bound by the sha256 the index recorded
  }
  const drop = async () => { if (!own) await fsp.rm(staged, { force: true }); }; // a staged proposal's file is the engine's to delete
  const info = await runner('dpkg-deb', ['-I', staged], { env: env(), timeout: 30000 });
  const ctl = await runner('dpkg-deb', ['-f', staged, 'Package', 'Version', 'Architecture', 'Maintainer'], { env: env(), timeout: 30000 });
  const fields = {};
  for (const l of ctl.stdout.split('\n')) { const m = /^([A-Za-z-]+): (.*)$/.exec(l); if (m) fields[m[1]] = m[2]; }
  if (info.code !== 0 || !A.PKG_RE.test(fields.Package || '')) { await drop(); return ret({ ok: false, code: 'bad_name', error: `${path.basename(file)} is not a Debian package (dpkg-deb cannot read it)`, kind }); }
  const scripts = ['preinst', 'postinst', 'prerm', 'postrm', 'config'].filter((x) => new RegExp(`\\blines\\s+\\*?\\s*${x}\\b`).test(info.stdout)); // dpkg-deb -I's control-archive listing: "<n> bytes, <n> lines  *  postinst  #!/bin/sh"
  const opts = await simOpts();
  const sim = await runner('apt-get', [...opts, '-s', 'install', staged], { env: env() });
  const uris = await runner('apt-get', [...opts, '--print-uris', '-y', 'install', staged], { env: env() });
  const pl = A.parsePlan(both(sim), both(uris), { requested: [fields.Package], facts: intoSys ? { ...f, rootFree: f.homeFree } : f, kind: 'deb' });
  const deb = { package: fields.Package, version: fields.Version || null, arch: fields.Architecture || null, sha256, size: st.size, name: path.basename(file), maintainer: (fields.Maintainer || '').slice(0, 120), scripts };
  if (!pl.ok) { await drop(); return ret({ ...pl, deb }); }
  const tw = intoSys ? await twinOf([deb.package], manifest) : { twin: null, overlap: [] };
  const entryId = await entryIdFor([deb.package], manifest, { kind: 'deb', layer: intoSys ? 'sys' : null, ...(tw.twin ? { asked: tw.twin.id, moving: true } : {}) });
  const app = own ? await debApp(staged, deb.package) : null;
  return moveTail(ret({ ...pl, mode: 'deb', entryId, source: 'local-file', deb, staged, ...(own ? { stagedName: p.staged, app, downloadBytes: (pl.downloadBytes || 0) + (/^'file:/m.test(both(uris)) ? 0 : st.size) /* apps-joint r1 F5: apt lists the local file itself */ } : {}), packages: [deb.package], commands: A.appCommands({ mode: 'deb', deb }), argv: A.appArgv({ mode: 'deb', appsDir, id: entryId, nonce, args: [staged, sha256], root: f.root }), label: (app && app.name) || deb.package }), tw);
}

/** The steps a person reads above Install for this kind's root run (app-manifest appCommands, mode `deb`). */
const commands = ({ deb, lock, cache, keep }) => [`# the file is copied into ~/.vibespace/apps/debs (sha256 ${deb && deb.sha256 ? deb.sha256 : '?'})`, `sudo apt-get ${lock} update`, `sudo DEBIAN_FRONTEND=noninteractive apt-get ${lock} ${cache} install -y ./${deb && deb.name ? deb.name : 'package.deb'}`, keep];
/** The record reader (app-manifest normEntry): what root wrote for a deb entry — its package, sha256 and file name. */
function record(e, { isObj, str, num, SHA256_RE, PKG_RE }) {
  const d = e.deb;
  if (!isObj(d) || !SHA256_RE.test(String(d.sha256 || '')) || !PKG_RE.test(String(d.package || ''))) return { error: 'a deb entry carries {package, sha256, name}' };
  return { deb: { package: d.package, sha256: d.sha256, name: str(d.name, 200) || `${d.package}.deb`, size: num(d.size) } };
}
/** A request naming a .deb file on the machine (normRequest), after the staged / fetched forms the row's `staged` takes. */
function requestOf(x, { kind }) { const p = String(x.debPath || ''); if (!p.startsWith('/') || !p.endsWith('.deb') || p.length > 4096 || /[\0\n]/.test(p)) return { ok: false, code: 'bad_name', error: 'name a .deb file by its absolute path on that machine' }; return { ok: true, request: { kind, debPath: p } }; }
/** The index entry this install would reuse: the same package from a file (src/app-serve.js entryIdFor). */
const sameEntry = (e, packages) => e.kind === 'deb' && e.deb && e.deb.package === packages[0];
/** The proposal card's extra lines (the engine's For-you sentence). */
const proposeLines = (pl) => (pl.deb && pl.deb.scripts && pl.deb.scripts.length ? [`Runs its own install scripts as administrator: ${pl.deb.scripts.join(' ')}`] : []);
/** The dialog's words: its title, the file rows under the plan, the note on a listed entry. */
const dialogTitle = (t, machine) => t('Install a .deb file on {machine}', { machine });
function dialogRows(plan, line, t) {
  if (!plan.deb) return;
    line(t('File: {name} · sha256 {sha}', { name: plan.deb.name, sha: plan.deb.sha256 }), 'app-plan-mono');
    if ((plan.deb.scripts || []).length) line(t('It runs its own install scripts as root: {scripts}', { scripts: plan.deb.scripts.join(', ') }), 'app-plan-warn');
}
const entryNote = (t) => t('from a .deb file');

module.exports = Object.freeze({ id: 'deb', entry: 'root', plan: true, request: true, agent: true, sysView: true, card: 'deb', from: 'download', staged: 'deb', mode: 'deb', fileBound: true,
  recordSource: 'local-file', closurePlan: true, planner, commands, record, requestOf, sameEntry, proposeLines, dialogTitle, dialogRows, entryNote });
