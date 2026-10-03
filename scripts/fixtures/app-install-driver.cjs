'use strict';
// THE IN-CONTAINER DRIVER of scripts/test-app-install.mjs — runs INSIDE a throwaway Debian 12 container as a non-root user
// with passwordless sudo (the fleet pod's shape), over the REAL modules of the checkout bind-mounted read-only at /repo:
// the machine keeper (src/desktop-serve.js → src/app-serve.js), the access layer (src/server/desktop-access.js — the ONE
// package slot) and the hub's apps engine (src/server/apps-engine.js). One command per call; the answer is ONE line
// `@@RESULT <json>` on stdout (the suite parses it). Never run on a real machine: the suite starts it only in a container.
//   node app-install-driver.cjs <cmd> [<json> [<step>]]   (the answer carries `step` — the suite's name for the call)
//     status                         the engine's status (manifest, rows, replay decision, drift)
//     run {request}                  engine.run(request) — the user's press (install / deb / adopt / remove / refresh)
//     afterListen                    the boot replay (engine.afterListen)
//     parity                         the PURE stanza / base-sha builders vs what root wrote
//     steer {victim, packages}       verify-r1 F1: the index edited so root's entry `victim` claims `packages` → the plan's id
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const REPO = process.env.VS_REPO || '/repo';
const HOME = process.env.HOME;
const STATE = path.join(HOME, '.vibespace');
const env = { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME, LANG: 'C.UTF-8' };
const quiet = { log: () => { }, warn: (m) => process.stderr.write(`[warn] ${m}\n`), error: (m) => process.stderr.write(`[error] ${m}\n`) };
fs.mkdirSync(STATE, { recursive: true });
const DS = require(path.join(REPO, 'src/desktop-serve.js'));
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const ENG = require(path.join(REPO, 'src/server/apps-engine.js'));
const A = require(path.join(REPO, 'src/app-manifest.js'));
const machine = DS.install({ dataDir: STATE, env: () => env, log: quiet, appsHome: HOME });
const access = ACC.create({ hosts: null, local: () => machine, install: false, env: () => env, log: quiet, installMs: 20 * 60 * 1000 });
const hub = path.join(STATE, 'hub'); fs.mkdirSync(hub, { recursive: true });
const engine = ENG.create({ access, dataDir: hub, log: quiet });
const [cmd, arg, step] = process.argv.slice(2);
const out = (o) => { process.stdout.write(`@@RESULT ${JSON.stringify({ step: step || cmd, ...o })}\n`); }; // the suite maps answers by STEP, never by position
const p = arg ? JSON.parse(arg) : {};
(async () => {
  const t0 = Date.now();
  try {
    if (cmd === 'status') { const s = await engine.status('local'); out({ ok: true, ms: Date.now() - t0, status: { entries: s.entries, rows: s.rows, manifest: s.manifest, replay: s.replay, drift: s.drift, updates: s.updates, refreshedAt: s.refreshedAt, facts: s.facts } }); return; }
    if (cmd === 'run') { const log = []; const r = await engine.run({ host: 'local', request: p.request, onData: (d) => log.push(String(d)) }); out({ ok: true, ms: Date.now() - t0, result: r, log: log.join('').slice(-20000) }); return; }
    if (cmd === 'plan') { const r = await engine.plan('local', p.request); out({ ok: true, ms: Date.now() - t0, plan: r.plan, digest: r.digest }); return; }
    if (cmd === 'afterListen') { const r = await engine.afterListen(); out({ ok: true, ms: Date.now() - t0, result: r }); return; }
    if (cmd === 'steer') {
      // verify-r1 F1: an agent (this same user) edits the user-writable index so root's existing entry `victim` claims
      // `packages`; the plan of those packages must not write under the victim's id (root's record would be replaced)
      const mf = path.join(STATE, 'apps', 'manifest.json');
      const keep = fs.readFileSync(mf, 'utf8');
      const m = JSON.parse(keep);
      m.entries = m.entries.map((e) => (e.id === p.victim ? { ...e, packages: p.packages } : e));
      fs.writeFileSync(mf, JSON.stringify(m));
      try { const r = await engine.plan('local', { kind: 'apt', packages: p.packages }); out({ ok: true, ms: Date.now() - t0, entryId: r.plan.entryId, argvId: r.plan.argv ? r.plan.argv[r.plan.argv.indexOf('vs-app') + 3] : null, digest: r.digest }); }
      finally { fs.writeFileSync(mf, keep); }
      return;
    }
    if (cmd === 'parity') {
      const D = path.join(STATE, 'apps', 'debs');
      const rows = [];
      for (const f of fs.readdirSync(D).filter((x) => x.endsWith('.deb')).sort()) {
        const deb = path.join(D, f);
        const control = execFileSync('dpkg-deb', ['-f', deb], { encoding: 'utf8' });
        const sha = crypto.createHash('sha256').update(fs.readFileSync(deb)).digest('hex');
        const want = A.packagesStanza({ control, filename: f, size: fs.statSync(deb).size, sha256: sha });
        const got = fs.readFileSync(deb.replace(/\.deb$/, '.stanza'), 'utf8');
        rows.push({ f, same: want === got, nameOk: f === A.debFileName({ package: A.parseStanza(got).package, version: A.parseStanza(got).version, arch: A.parseStanza(got).arch }) });
      }
      const idx = fs.readFileSync(path.join(D, 'Packages'), 'utf8');
      const stanzas = fs.readdirSync(D).filter((x) => x.endsWith('.stanza')).sort().map((x) => fs.readFileSync(path.join(D, x), 'utf8'));
      const base = (fs.readFileSync(path.join(STATE, 'apps', 'sys', 'base', 'sha'), 'utf8') || '').trim();
      const baseNode = crypto.createHash('sha256').update(A.dpkgListText(A.parseDpkgStatus(fs.readFileSync(path.join(STATE, 'apps', 'sys', 'base', 'status'), 'utf8')))).digest('hex');
      const stat = (x) => { const s = fs.lstatSync(x); return { uid: s.uid, mode: (s.mode & 0o7777).toString(8) }; };
      out({ ok: true, rows, index: idx === A.packagesIndex(stanzas), base, baseNode, owners: { debs: stat(D), sys: stat(path.join(STATE, 'apps', 'sys')), entries: stat(path.join(STATE, 'apps', 'sys', 'entries')), manifest: stat(path.join(STATE, 'apps', 'manifest.json')), apps: stat(path.join(STATE, 'apps')) } });
      return;
    }
    out({ ok: false, error: `unknown command ${cmd}` });
  } catch (e) {
    let slotLog = '';
    try { slotLog = fs.readFileSync(path.join(STATE, 'xpra-install.log'), 'utf8').split('\n').filter((l) => /^= |^\+ |^E: |^W: /.test(l)).slice(-40).join('\n'); } catch { slotLog = ''; }
    out({ ok: false, code: e.code || null, error: String(e.message || e), ms: Date.now() - t0, plan: e.plan ? { code: e.plan.code, error: e.plan.error } : null, slotLog });
  }
  finally { try { machine.shutdown?.(); } catch { } }
})();
