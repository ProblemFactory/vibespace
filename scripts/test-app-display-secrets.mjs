#!/usr/bin/env node
// lane app-display-secrets (2026-10-12, B-4a59 piece 4): an app on its own display gets a Secret Service on its private
// bus — the PURE plan rows, secret-box's keyed cipher (same bytes), then the REAL plan's bus (desktop-apps portalPlan +
// secretServicePlan, desktop-display startPortalBus / appSecretsFacts) with libsecret's own client (scripts/fixtures/
// secret-probe.py, python3 gi Secret): store / lookup / search by attributes / delete / a second item / Unlock without a
// prompt / a restart keeps the items (sealed file round-trip) / Forget all (bus and file) / no secret or key in a log,
// the store or any argv — and its RED controls: the setting off ⇒ ServiceUnknown; a service that logs a secret ⇒ red.
// Fixtures only: a scratch HOME + runtime dir + data dir, a bogus DISPLAY (nothing here draws), never the owner's bus.
// lane mirror-263-reds: a FAST suite never requires a machine capability — the plan's shape is proven over a FIXTURE
// binary table (+ the empty-table refusal as its RED control); ③ is the ONE real-binary road and SKIPs with the reason
// on a box without the portal binaries / python3-gi (the CI runner has no xdg-desktop-portal).
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync, spawnSync } from 'child_process';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(ROOT, 'src/desktop-apps.js'));
const D = require(path.join(ROOT, 'src/desktop-display.js'));
const SB = require(path.join(ROOT, 'src/secret-box.js'));
const PROBE = path.join(ROOT, 'scripts/fixtures/secret-probe.py');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); } };
const t0 = Date.now();

console.log('① PURE: secretServicePlan / secretsCountOf / the setting');
const plan0 = { ok: true, dirs: ['/x/portal', '/x/portal/services'], files: [], env: {} };
const facts0 = { python: '/usr/bin/python3', service: '/s/secret-service.py', node: '/n/node', sealer: '/s/app-secrets-seal.js', keyHex: 'ab'.repeat(32) };
const on = M.secretServicePlan({ plan: plan0, facts: facts0 });
check('on: service file activates org.freedesktop.secrets with python + service + store + node + sealer', on.secrets === 'on' && on.file.file === '/x/portal/services/org.freedesktop.secrets.service' && on.file.text === '[D-BUS Service]\nName=org.freedesktop.secrets\nExec=/usr/bin/python3 /s/secret-service.py /x/portal/secrets.json /n/node /s/app-secrets-seal.js\n', JSON.stringify(on));
check('on: the key rides the BUS env only — never the Exec line', on.env.VS_APP_SECRETS_KEY === facts0.keyHex && !on.file.text.includes(facts0.keyHex));
check('off / unset facts ⇒ off, no file', M.secretServicePlan({ plan: plan0, facts: { off: true } }).secrets === 'off' && M.secretServicePlan({ plan: plan0, facts: null }).file === null);
check('a missing piece is SAID', M.secretServicePlan({ plan: plan0, facts: { why: 'python3 not found on this machine' } }).secrets === 'unavailable: python3 not found on this machine');
check('no bus ⇒ unavailable', /^unavailable: no private bus/.test(M.secretServicePlan({ plan: { ok: false }, facts: facts0 }).secrets));
check('a malformed key ⇒ unavailable, no file', M.secretServicePlan({ plan: plan0, facts: { ...facts0, keyHex: 'zz' } }).file === null);
check('a path with a space ⇒ unavailable (Exec= splits)', /space/.test(M.secretServicePlan({ plan: plan0, facts: { ...facts0, node: '/a b/node' } }).secrets));
check('secretsCountOf reads n, refuses junk', M.secretsCountOf('{"v":1,"n":3,"sealed":"x"}') === 3 && M.secretsCountOf('nope') === null && M.secretsCountOf('{"n":-1}') === null);
check('appSecretsMode default on', M.appSecretsMode(undefined) === 'on' && M.appSecretsMode('off') === 'off' && M.APP_SECRETS_DEFAULT === 'on');
const schema = require(path.join(ROOT, 'src/lib/settings-schema.js'));
const SS = schema.SETTINGS_SCHEMA || schema.SCHEMA || schema.default || schema;
const row = SS['desktop.appSecrets'] || (Array.isArray(SS) ? SS.find((r) => r.key === 'desktop.appSecrets') : null);
check('Settings desktop.appSecrets on|off, default on', !!row && row.default === 'on' && row.options.map((o) => o.value).join() === 'on,off');
const BINS0 = { 'dbus-daemon': '/x/bin/dbus-daemon', 'xdg-desktop-portal': '/x/libexec/xdg-desktop-portal', 'xdg-desktop-portal-gtk': '/x/libexec/xdg-desktop-portal-gtk' };
const planF = M.portalPlan({ dir: '/x/da-f1', display: ':199', authFile: null, bins: BINS0, why: 'browser' });
const onF = M.secretServicePlan({ plan: planF, facts: facts0 });
check('portalPlan over a FIXTURE binary table: the bus, its services dir, the portal + gtk service files; the secrets file lands in that dir', planF.ok && planF.address === 'unix:path=/x/da-f1/portal/bus' && planF.dirs[0] === '/x/da-f1/portal' && planF.files.some((f) => f.file === '/x/da-f1/portal/services/org.freedesktop.portal.Desktop.service' && f.text.includes('Exec=/x/libexec/xdg-desktop-portal\n')) && onF.secrets === 'on' && onF.file.file === '/x/da-f1/portal/services/org.freedesktop.secrets.service', JSON.stringify(planF.why || planF.files && planF.files.map((f) => f.file)));
const plan00 = M.portalPlan({ dir: '/x/da-f1', display: ':199', authFile: null, bins: {}, why: 'browser' });
check('RED control: an EMPTY binary table ⇒ the plan refuses and names every missing binary (and the secrets plan says no bus)', plan00.ok === false && plan00.why === 'dbus-daemon, xdg-desktop-portal, xdg-desktop-portal-gtk not found on this machine' && M.secretServicePlan({ plan: plan00, facts: facts0 }).secrets === 'unavailable: no private bus', JSON.stringify(plan00));

console.log('② secret-box: the keyed cipher is the boxes\' cipher (same bytes both ways)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-adsec-t-'));
const box = SB.secretBox(path.join(tmp, '.k'));
const k = box.readKey();
check('box.enc ⇒ decWith(key)', SB.decWith(k, box.enc('héllo')) === 'héllo');
check('encWith(key) ⇒ box.dec', box.dec(SB.encWith(k, 'wörld')) === 'wörld');
let threw = ''; try { SB.decWith(crypto.randomBytes(32), box.enc('x')); } catch (e) { threw = e.code; }
check('another key ⇒ bad-ciphertext', threw === 'bad-ciphertext');

console.log('②b a REFUSED plan ({ ok:false, why }) in every product consumer: its why, never its dirs (lane secrets-chrome-skip)');
const srcOf = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const srcFiles = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
const users = srcFiles.filter((f) => /\bportalPlan\(|\bplan\.dirs\b/.test(srcOf(f).replace(/^\s*(\/\/|\*).*$/gm, ''))).sort();
console.log(`  census (src/*.js naming portalPlan( or plan.dirs in code): ${users.join(', ')}`);
check('the census is the three known consumers (a new one ⇒ red until it reads plan.ok here)', users.join() === 'desktop-apps.js,desktop-display.js,desktop-serve.js', users.join());
const refused = { ok: false, why: 'xdg-desktop-portal, xdg-desktop-portal-gtk not found on this machine' };
check('desktop-serve: the bring-up reads plan.ok and records the why (no secrets plan on a refused plan)', /secrets = plan\.ok && /.test(srcOf('desktop-serve.js')) && /if \(!plan\.ok\) rec\.portal = `unavailable: \$\{plan\.why\}`/.test(srcOf('desktop-serve.js')));
check('desktop-apps secretServicePlan: a refused plan ⇒ unavailable: no private bus', M.secretServicePlan({ plan: refused, facts: { python: '/p', service: '/s', node: '/n', sealer: '/x', keyHex: 'a'.repeat(64) } }).secrets === 'unavailable: no private bus');
const rej = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const eBus = await rej(() => D.startPortalBus({ plan: refused, env: {} }));
check('desktop-display startPortalBus: a refused plan REJECTS by name with the plan\'s why', !!eBus && eBus.code === 'portal-bus' && eBus.message === `no portal plan: ${refused.why}`, eBus && `${eBus.code} ${eBus.message}`);
const busSrc = (srcOf('desktop-display.js').match(/async function startPortalBus\([\s\S]*?\n\}\n/) || [''])[0];
const guard = busSrc.split('\n').find((l) => /if \(!plan \|\| !plan\.ok\) throw/.test(l)) || '';
const unguarded = new Function('fs', 'namedError', `return (${busSrc.replace(guard + '\n', '')})`)(fs, (c, m) => Object.assign(new Error(m), { code: c }));
const eRed = await rej(() => unguarded({ plan: refused, env: {} }));
check('RED control: the same function WITHOUT the check throws the runner\'s TypeError (plan.dirs is not iterable)', !!guard && eRed instanceof TypeError && /plan\.dirs is not iterable/.test(eRed.message), eRed && eRed.message);

console.log('③ the real plan\'s bus + libsecret');
const dataDir = path.join(tmp, 'data'), appDir = path.join(dataDir, 'desktop-apps', 'da-sec1'), home = path.join(tmp, 'home'), run = path.join(tmp, 'run');
for (const d of [appDir, home, run]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const env = { PATH: process.env.PATH, HOME: home, XDG_RUNTIME_DIR: run };
const facts = await D.appSecretsFacts({ env, mode: 'on', dataDir, id: 'da-sec1' });
const realPlan = M.portalPlan({ dir: appDir, display: ':199', authFile: null, bins: D.portalBins({ env }), why: 'browser' });
const capWhy = !realPlan.ok ? `portalPlan: ${realPlan.why}` : /^python3 /.test(facts.why || '') ? `appSecretsFacts: ${facts.why}` : null;
if (capWhy) { // a machine capability, never a red: the plan's shape is proven in ① over the fixture table
  console.log(`  SKIP: ${capWhy} — ③ the real bus + libsecret road runs only where they exist`);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed, 1 skipped (${Date.now() - t0} ms)`);
  process.exit(fail ? 1 : 0);
}
check('facts: python3 + gi + service + sealer + a 32-byte per-display key', !facts.why && /^[0-9a-f]{64}$/.test(facts.keyHex || ''), JSON.stringify(facts.why || ''));
const facts2 = await D.appSecretsFacts({ env, mode: 'on', dataDir, id: 'da-sec2' });
check('the key is PER DISPLAY (another id ⇒ another key), the master is minted 0600', facts2.keyHex !== facts.keyHex && (fs.statSync(path.join(dataDir, '.app-secrets-key')).mode & 0o777) === 0o600);
check('the setting off ⇒ { off }', (await D.appSecretsFacts({ env, mode: 'off', dataDir, id: 'da-sec1' })).off === true);
const children = [];
async function startBus(mode = 'on', serviceOverride = null) {
  const plan = M.portalPlan({ dir: appDir, display: ':199', authFile: null, bins: D.portalBins({ env }), why: 'browser' });
  if (!plan.ok) throw new Error(`portalPlan: ${plan.why}`);
  const f = mode === 'on' ? (serviceOverride ? { ...facts, service: serviceOverride } : facts) : { off: true };
  const ss = M.secretServicePlan({ plan, facts: f });
  if (ss.file) { plan.files.push(ss.file); Object.assign(plan.env, ss.env); }
  const sd = path.join(appDir, 'portal', 'services');
  if (fs.existsSync(sd)) for (const g of fs.readdirSync(sd).filter((n) => n.startsWith('org.freedesktop.secrets'))) fs.unlinkSync(path.join(sd, g));
  const logFd = fs.openSync(path.join(appDir, 'app.log'), 'a');
  const child = await D.startPortalBus({ plan, env, logFd });
  children.push(child);
  return { plan, ss, child };
}
const gone = (pid) => { try { return /^\d+ \(.*\) [ZX]/.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; } };
async function stopBus(b) { // the bus child is detached + unref'd (no exit event keeps this loop alive): poll /proc, then the service follows it
  b.child.kill('SIGTERM');
  for (let i = 0; i < 60 && !gone(b.child.pid); i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 300));
}
const probe = (plan, ...args) => {
  const r = spawnSync('python3', [PROBE, ...args], { env: { PATH: process.env.PATH, HOME: home, XDG_RUNTIME_DIR: run, DBUS_SESSION_BUS_ADDRESS: plan.address }, encoding: 'utf8', timeout: 30000 });
  return Object.fromEntries(String(r.stdout || '').trim().split('\n').filter(Boolean).map((l) => { const o = JSON.parse(l); return [o.step, o]; }));
};
try {
  // RED control: no service on the bus (the setting off) ⇒ libsecret's ServiceUnknown, bounded
  let b = await startBus('off');
  let r = probe(b.plan, 'store');
  check('RED control: setting off ⇒ libsecret fails "not provided by any .service files" (no hang)', r.store && !r.store.ok && /org\.freedesktop\.secrets was not provided/.test(r.store.error) && r.store.ms < 2000, JSON.stringify(r.store));
  await stopBus(b);
  b = await startBus('on');
  check('rec.secrets fact = on', b.ss.secrets === 'on');
  r = probe(b.plan, 'all', 'pw-one-s3cr3t');
  check('store (activates the service, ≤ 3 s)', r.store && r.store.ok && r.store.ms < 3000, JSON.stringify(r.store));
  check('a second item', r.store2 && r.store2.ok);
  check('lookup by attributes', r.lookup && r.lookup.value === 'pw-one-s3cr3t');
  check('search by attributes finds both', r.search && JSON.stringify(r.search.value) === '["ann at a","bob at a"]' && JSON.stringify(r['search-secrets'].value) === '["pw-one-s3cr3t","pw-two"]');
  check('delete ⇒ lookup null', r.delete && r.delete.ok && r['lookup-after-delete'].value === null);
  r = probe(b.plan, 'store', 'pw-one-s3cr3t');
  r = probe(b.plan, 'unlock');
  check('Unlock answers the objects, no prompt, never locked', r.unlock && r.unlock.ok && r.unlock.value.unlocked === 1 && r.unlock.value.locked.join() === 'false');
  const store = path.join(appDir, 'portal', M.SECRETS_STORE_FILE);
  const sealed = fs.readFileSync(store, 'utf8');
  check('ONE sealed file, 0600, n = 2, no plaintext secret or attribute', JSON.parse(sealed).n === 2 && (fs.statSync(store).mode & 0o777) === 0o600 && !/s3cr3t|pw-two|ann|a\.example/.test(sealed));
  const pids = execFileSync('ps', ['-s', String(b.child.pid), '-o', 'pid='], { encoding: 'utf8' }).trim().split(/\s+/);
  const argvs = pids.map((p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8'); } catch { return ''; } }).join('\n');
  check('the service runs in the bus\'s session; no key or secret in any argv', /secret-service\.py/.test(argvs) && !argvs.includes(facts.keyHex) && !argvs.includes('s3cr3t'));
  await stopBus(b);
  b = await startBus('on');
  r = probe(b.plan, 'search');
  check('a restart keeps the items (the sealed file round-trips)', r['search-secrets'] && JSON.stringify(r['search-secrets'].value) === '["pw-one-s3cr3t","pw-two"]', JSON.stringify(r['search-secrets']));
  const of = D.appSecretsOf({ rec: { secrets: 'on' }, dir: appDir });
  check('appSecretsOf: the count the ⋯ menu shows', of.count === 2 && of.secrets === 'on');
  const fg = await D.forgetAppSecrets({ rec: { secrets: 'on' }, dir: appDir, env });
  r = probe(b.plan, 'search');
  check('Forget all over the bus ⇒ forgot 2, nothing found, count 0', fg.ok && fg.via === 'bus' && fg.forgot === 2 && JSON.stringify(r.search.value) === '[]' && D.appSecretsOf({ rec: { secrets: 'on' }, dir: appDir }).count === 0, JSON.stringify(fg));
  probe(b.plan, 'store', 'pw-again');
  await stopBus(b);
  const fg2 = await D.forgetAppSecrets({ rec: { secrets: 'on' }, dir: appDir, env });
  check('Forget all with no bus ⇒ the sealed file is removed', fg2.ok && fg2.via === 'file' && fg2.forgot === 1 && !fs.existsSync(store), JSON.stringify(fg2));
  const log = fs.readFileSync(path.join(appDir, 'app.log'), 'utf8');
  check('libsecret asked dh-ietf1024-sha256-aes128-cbc-pkcs7 first, refused (NotSupported), then plain', /OpenSession dh-ietf1024-sha256-aes128-cbc-pkcs7 refused \(NotSupported\)[\s\S]*OpenSession plain/.test(log));
  check('the app\'s log names no secret, attribute or key', !/s3cr3t|pw-two|pw-again|ann at a|a\.example/.test(log) && !log.includes(facts.keyHex));
  // the mutant: a service that logs the secret it is handed ⇒ the same check goes red
  const mut = path.join(tmp, 'secret-service-mutant.py');
  const src = fs.readFileSync(path.join(ROOT, 'src/secret-service.py'), 'utf8');
  const anchor = "            val = {'label'";
  if (!src.includes(anchor)) throw new Error('mutant anchor moved');
  fs.writeFileSync(mut, src.replace(anchor, "            say('stored ' + bytes(sec[2]).decode('utf-8', 'replace'))\n" + anchor));
  b = await startBus('on', mut);
  probe(b.plan, 'store', 'pw-mutant-s3cr3t');
  await stopBus(b);
  const mlog = fs.readFileSync(path.join(appDir, 'app.log'), 'utf8');
  check('MUTANT (the service logs a secret) ⇒ the no-secret-in-log check is RED', /pw-mutant-s3cr3t/.test(mlog));
} finally {
  for (const c of children) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed (${Date.now() - t0} ms)`);
process.exit(fail ? 1 : 0);
