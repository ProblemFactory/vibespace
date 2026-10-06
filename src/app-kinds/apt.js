'use strict';
/** THE `apt` APP KIND — packages from the machine's package sources (or an approved third-party one), installed by root
 *  through the package slot (1–64 Debian packages; it may go INTO the app system). PURE, imports nothing; one line in
 *  src/app-kinds/index.js (lane dc-app-kinds). The DEFAULT root kind: a root install of a request that is not a root
 *  kind itself (adopt, refresh) is recorded as apt. */
/** THE PLAN of packages by name (and of `adopt`: keep the installed ones) — the machine half's plan body for it, moved verbatim out of src/app-serve.js plan() (lane
 *  dc-app-kinds). `c` = the plan context src/app-serve.js hands every kind (the request p, the machine facts f, the
 *  index, the nonce, the runner, the simulations, `ret` …); answers THE plan or a named refusal. */
async function planner(c) {
  const { p, f, kind, manifest, nonce, canRun, intoSys, ret, simOpts, moveTail, label0, A, appsDir, both, env, runner, dpkgNow, entryIdFor, twinOf, rootEntries, sys } = c;
  const packages = (Array.isArray(p.packages) ? p.packages : String(p.packages || '').split(/[\s,]+/)).map(String).filter(Boolean).slice(0, 32);
  const bad = packages.find((x) => !A.PKG_RE.test(x));
  if (!packages.length || bad !== undefined) return ret({ ok: false, code: 'bad_name', error: bad !== undefined ? `${JSON.stringify(String(bad).slice(0, 64))} is not a Debian package name` : 'no package named', kind, packages });
  const tw = intoSys ? await twinOf(packages, manifest) : { twin: null, overlap: [] };
  const entryId = await entryIdFor(packages, manifest, { kind: 'apt', asked: tw.twin ? tw.twin.id : p.entryId, layer: intoSys ? 'sys' : null, moving: !!tw.twin });
  if (kind === 'adopt') {
    const now0 = await dpkgNow();
    const have = new Set((now0.list || []).map((x) => x.package));
    const missing = packages.filter((x) => !have.has(x));
    if (missing.length) return ret({ ok: false, code: 'not_found', error: `${missing.join(', ')} is not installed here — nothing to adopt`, kind, packages });
    return ret({ ok: true, code: canRun ? null : 'no_sudo', error: canRun ? null : 'this machine has no passwordless sudo — run the commands below yourself', canRun, kind, mode: 'adopt', packages, entryId, source: 'apt', closure: [], closureKey: packages.slice().sort().join(' '), commands: A.appCommands({ mode: 'adopt', packages }), argv: A.appArgv({ mode: 'adopt', appsDir, id: entryId, nonce, args: packages, root: f.root }), label: label0(packages) });
  }
  const opts = await simOpts();
  const sim = await runner('apt-get', [...opts, '-s', 'install', ...packages], { env: env() });
  const uris = await runner('apt-get', [...opts, '--print-uris', '-y', 'install', ...packages], { env: env() });
  const pl = A.parsePlan(both(sim), both(uris), { requested: packages, facts: intoSys ? { ...f, rootFree: f.homeFree } : f, kind: 'apt' });
  if (!pl.ok) return ret(pl);
  const recorded = (intoSys ? await sys.entries() : await rootEntries()).some((e) => e.packages.join(' ') === packages.join(' ')); // root keeps exactly these already (an agent's "nothing to install" proposal is refused by the hub)
  return moveTail(ret({ ...pl, mode: 'install', entryId, recorded, source: 'apt', commands: A.appCommands({ mode: 'install', packages }), argv: A.appArgv({ mode: 'install', appsDir, id: entryId, nonce, args: packages, root: f.root }), label: label0(packages) }), tw);
}

/** The steps a person reads above Install for this kind's root run (app-manifest appCommands, mode `install`). */
const commands = ({ packages, lock, cache, keep }) => [`sudo apt-get ${lock} update`, `sudo DEBIAN_FRONTEND=noninteractive apt-get ${lock} ${cache} install -y ${packages.join(' ')}`, keep];
/** A request naming packages (normRequest): 1–32 Debian package names. */
function requestOf(x, { kind, PKG_RE }) {
  const packages = (Array.isArray(x.packages) ? x.packages : String(x.packages || '').split(/[\s,]+/)).map(String).filter(Boolean);
  if (!packages.length || packages.length > 32) return { ok: false, code: 'bad_name', error: 'name one to 32 packages' };
  const bad = packages.find((p) => !PKG_RE.test(p));
  if (bad !== undefined) return { ok: false, code: 'bad_name', error: `${JSON.stringify(bad.slice(0, 64))} is not a Debian package name` };
  return { ok: true, request: { kind, packages } };
}
/** The index entry this install would reuse: the same package set (src/app-serve.js entryIdFor). */
const sameEntry = (e, packages, key) => e.kind === 'apt' && e.packages.join(' ') === key;

module.exports = Object.freeze({ id: 'apt', entry: 'root', plan: true, request: true, agent: true, sysView: true, card: 'package', rootDefault: true, mode: 'install', closurePlan: true,
  doing: 'installing', doneNote: ' It added no desktop app (no .desktop file) — the programs are on PATH.', planner, commands, requestOf, sameEntry });
