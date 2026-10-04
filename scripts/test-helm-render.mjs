#!/usr/bin/env node
// THE CHART'S COMPANY-PRESETS VOLUME (lane cluster-presets, B-53fe, P2).
// Fast tier: `helm template` (read-only — never an install) over the value
// shapes a fleet has, judged on the rendered text (no YAML library in the
// tree: documents split on `---`, the Deployment compared WHOLE across shapes).
//
// A a release WITH the per-release blocks (gdrive.clients + integrations — env
//   today) ⇒ the VOLUME form: no preset env (VIBESPACE_GDRIVE_CLIENTS /
//   VIBESPACE_INTEGRATIONS / the legacy pair), VIBESPACE_PRESETS_DIR, a
//   read-only mount with NO subPath, a projected volume of TWO secret sources
//   (the cluster Secret, the release's override Secret) both optional:true
//   with the four items; the blocks are the OVERRIDE, in their OWN Secret
//   `<release>-preset-override` rendered with `data:` (B-8145) — the release
//   Secret carries no preset key.
// B presets.override set beside the legacy blocks ⇒ the override wins.
// C a release WITHOUT any block (a new user) ⇒ the same volume: it inherits
//   the cluster Secret; its override Secret is empty (`data: {}`).
// D the legacy single gdrive.clientId/secret ⇒ one `default` entry in the
//   override list; no gdriveClientSecret key, no env.
// E presets.volume=false ⇒ the env form, as before (+ byte-identical to the
//   pre-lane chart at 2.369.199 when the history is present — else SKIP said).
// F clusterSecret / mountPath named ⇒ the source and the mount follow.
// G THE POD TEMPLATE IS THE SAME for A, B, C, D: the item list never depends
//   on the values, so changing an override is a Secret-only upgrade — no roll.
// H AN UPGRADE THAT DROPS AN OVERRIDE KEY REMOVES IT (B-8145): helm's 3-way
//   merge modelled on the rendered Secrets (kind/k3d-free): the key leaves the
//   override Secret and override/ — from this chart, and from the 2.369.200
//   chart (whose leftover stays in the release Secret, unread: the README's
//   kubectl patch); the same model on the 2.369.200 chart REPRODUCES the
//   field finding (the key stays projected). CONTROL: a copy that renders
//   the override Secret through `stringData:` keeps the dropped key.
// I THE APP-SYSTEM SWITCH (lane fleet-image-chart, App persistence Layer 1):
//   appSystem.enabled off (the default) ⇒ no VIBESPACE_APP_SYSTEM, no
//   container securityContext, and A / C / D render BYTE-IDENTICAL to the
//   pre-lane chart (2.369.210) when the history is present; on ⇒ the env "1"
//   + the $sysadmin branch FORCED (capabilities.add SYS_ADMIN + AppArmor
//   Unconfined), never a seccompProfile; on together with fuse / cephfs ⇒ ONE
//   SYS_ADMIN (no duplicate), with tun ⇒ SYS_ADMIN + NET_ADMIN; the presets
//   volume stays present by default either way.
// CONTROLS (chart copies in scratch): a subPath mount, a source without
//   optional, an env rendered beside the volume — each turns its assert red;
//   the app system's env without the forced caps, a second SYS_ADMIN, the env
//   rendered while off, a seccompProfile — each turns its I assert red.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const CHART = path.join(REPO, 'deploy/helm/vibespace-user');
const BASE_SHA = 'b924041f';            // 2.369.199 — the last chart before the volume form
const PRE_FIX_SHA = '0e7dc5b4';         // 2.369.200 — the volume form with the override in the release Secret's stringData (B-8145)
const PRE_APPSYS_SHA = '8d934bb1';      // 2.369.210 — the last chart before appSystem.enabled
const REL_OV = 'vibespace-alice-preset-override';
const ROOT = scratch('cpr');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });

const hv = spawnSync('helm', ['version', '--short'], { encoding: 'utf-8' });
if (hv.status !== 0) { console.log(`  … SKIP the whole suite: no helm on PATH (${(hv.error && hv.error.code) || hv.stderr}) — this gate is BLIND here; run it where helm exists`); console.log('\nALL PASS (0)'); process.exit(0); }
console.log(`  … helm ${hv.stdout.trim()}`);

const depOf = (out) => docOf(out, 'Deployment');
let n = 0;
function render(chart, values, extra = []) {
  const f = path.join(ROOT, `values-${++n}.json`);
  fs.writeFileSync(f, JSON.stringify(values));
  return execFileSync('helm', ['template', 'u-' + values.user, chart, '-f', f, ...extra], { encoding: 'utf-8' });
}
const docs = (out) => out.split(/^---\s*$/m).map((d) => d.trim()).filter(Boolean);
const docOf = (out, kind) => docs(out).find((d) => new RegExp(`^kind: ${kind}$`, 'm').test(d)) || '';
const envNames = (dep) => [...dep.matchAll(/^\s+- name: (VIBESPACE_[A-Z0-9_]+)$/gm)].map((m) => m[1]);
const stringData = (sec) => Object.fromEntries([...sec.matchAll(/^ {2}(\w+): (".*")$/gm)].map((m) => [m[1], JSON.parse(m[2])]));
const secretDocs = (out) => docs(out).filter((d) => /^kind: Secret$/m.test(d));
/** A rendered Secret's name + its `data` (base64) and `stringData` maps, kept apart. */
function secretFields(doc) {
  const f = { name: (doc.match(/^metadata:\n\s+name: (\S+)$/m) || [])[1], data: {}, stringData: {} }; let cur = null;
  for (const line of doc.split('\n')) {
    let m;
    if ((m = line.match(/^(data|stringData):( \{\})?$/))) { cur = m[1]; continue; }
    if (/^\S/.test(line)) { cur = null; continue; }
    if (cur && (m = line.match(/^ {2}(\w+): (".*")$/))) f[cur][m[1]] = JSON.parse(m[2]);
  }
  return f;
}
const secretNamed = (out, name) => secretFields(secretDocs(out).find((d) => secretFields(d).name === name) || '');
const unb64 = (v) => Buffer.from(v, 'base64').toString('utf-8');
/** A data-rendered Secret's keys, decoded. */
const dataOf = (out, name) => Object.fromEntries(Object.entries(secretNamed(out, name).data).map(([k, v]) => [k, unb64(v)]));
const PRESET_ENV = ['VIBESPACE_GDRIVE_CLIENTS', 'VIBESPACE_GDRIVE_CLIENT_ID', 'VIBESPACE_GDRIVE_CLIENT_SECRET', 'VIBESPACE_INTEGRATIONS'];

/** The volume form's structural verdict, as named failures ([] = good). */
function volumeVerdict(out, { cluster = 'vibespace-cluster-presets', mountPath = '/etc/vibespace/presets', release } = {}) {
  const dep = docOf(out, 'Deployment'); const bad = [];
  const env = envNames(dep);
  for (const e of PRESET_ENV) if (env.includes(e)) bad.push(`preset env ${e} rendered beside the volume`);
  if (!new RegExp(`- name: VIBESPACE_PRESETS_DIR\\n\\s+value: "${mountPath.replace(/\//g, '\\/')}"`).test(dep)) bad.push('VIBESPACE_PRESETS_DIR missing or not the mount path');
  if (!new RegExp(`- name: presets\\n\\s+mountPath: ${mountPath.replace(/\//g, '\\/')}\\n\\s+readOnly: true`).test(dep)) bad.push('the presets mount is missing / not read-only');
  if (/^\s+subPath:/m.test(dep)) bad.push('a subPath mount (it never updates)');
  const src = (name, prefix) => new RegExp(`- secret:\\n\\s+name: ${name}\\n\\s+optional: true\\n\\s+items:\\n\\s+- \\{ key: gdriveClients, path: ${prefix}gdrive-clients\\.json \\}\\n\\s+- \\{ key: integrations, path: ${prefix}integrations\\.json \\}`);
  if (!/- name: presets\n\s+projected:\n\s+sources:/.test(dep)) bad.push('no projected presets volume');
  if (!src(cluster, '').test(dep)) bad.push(`the cluster source ${cluster} (optional, both items) is missing`);
  if (!src(release, 'override/').test(dep)) bad.push(`the release source ${release} (optional, override/ items) is missing`);
  return bad;
}

const A = { user: 'alice', password: 'pw', gdrive: { clients: [{ key: 'org1', label: 'Org (internal)', clientId: 'cid-1.apps.googleusercontent.com', clientSecret: 'GOCSPX-alice-AAAAAAAAAAAA' }] }, integrations: [{ id: 'lark', key: 'jarvis', label: 'Lark (cluster app)', values: { appId: 'cli_aaaa', appSecret: 'lark-alice-secret-AAAAAAAA' } }] };
const B = { ...A, user: 'alice', presets: { override: { gdriveClients: [{ key: 'mine', label: 'Mine', clientId: 'mine.apps.googleusercontent.com', clientSecret: 'GOCSPX-mine-MMMMMMMMMMMM' }] } } };
const C = { user: 'alice', password: 'pw' };
const D = { user: 'alice', password: 'pw', gdrive: { clientId: 'legacy.apps.googleusercontent.com', clientSecret: 'GOCSPX-legacy-LLLLLLLLLLLL' } };

console.log('A a release with the blocks ⇒ the volume form');
const rA = render(CHART, A);
const vA = volumeVerdict(rA, { release: REL_OV });
ok(!vA.length, `the volume form: no preset env, VIBESPACE_PRESETS_DIR, a read-only mount (no subPath), two optional sources with their items${vA.length ? ' — ' + vA.join('; ') : ''}`);
const sA = dataOf(rA, REL_OV);
ok(sA.gdriveClients && JSON.parse(sA.gdriveClients)[0].key === 'org1' && JSON.parse(sA.integrations)[0].key === 'jarvis' && !Object.keys(secretNamed(rA, REL_OV).stringData).length, `the blocks are the OVERRIDE in ${REL_OV}, keys gdriveClients / integrations under data: (base64) — never stringData`);
const relA = secretNamed(rA, 'vibespace-alice');
ok(!['gdriveClients', 'integrations', 'gdriveClientSecret'].some((k) => k in relA.stringData || k in relA.data), 'the release Secret carries no preset key under the volume form');
ok(!/GOCSPX-|lark-alice-secret/.test(docOf(rA, 'Deployment')), 'no credential in the Deployment (every value is in the Secret)');

console.log('B presets.override wins over the legacy block');
const sB = dataOf(render(CHART, B), REL_OV);
ok(JSON.parse(sB.gdriveClients).map((c) => c.key).join() === 'mine' && JSON.parse(sB.integrations)[0].key === 'jarvis', 'presets.override.gdriveClients replaces gdrive.clients in the Secret; integrations falls back to the legacy block');

console.log('C a release without any block ⇒ inherits');
const rC = render(CHART, C);
const vC = volumeVerdict(rC, { release: REL_OV });
ok(!vC.length, `the same volume — the cluster Secret reaches a new user with no block of her own${vC.length ? ' — ' + vC.join('; ') : ''}`);
const sC = stringData(docOf(rC, 'Secret'));
ok(!('gdriveClients' in sC) && !('integrations' in sC) && !('gdriveClientSecret' in sC) && /^data: \{\}$/m.test(secretDocs(rC).find((d) => d.includes(REL_OV)) || ''), 'her own Secrets carry no preset key — the override Secret renders data: {} (optional:true projects nothing for it)');

console.log('D the legacy single client');
const rD = render(CHART, D);
const sD = dataOf(rD, REL_OV);
const dl = sD.gdriveClients ? JSON.parse(sD.gdriveClients) : [];
ok(dl.length === 1 && dl[0].key === 'default' && dl[0].clientId === 'legacy.apps.googleusercontent.com' && !('gdriveClientSecret' in sD) && !('gdriveClientSecret' in stringData(docOf(rD, 'Secret'))), 'gdrive.clientId/secret becomes ONE override entry keyed default (the env rung named it so); no gdriveClientSecret key');
ok(!volumeVerdict(rD, { release: REL_OV }).length, 'and the volume form, no env');

console.log('E presets.volume=false ⇒ the env form');
const rE = render(CHART, A, ['--set', 'presets.volume=false']);
const dE = docOf(rE, 'Deployment');
ok(envNames(dE).includes('VIBESPACE_GDRIVE_CLIENTS') && envNames(dE).includes('VIBESPACE_INTEGRATIONS') && !envNames(dE).includes('VIBESPACE_PRESETS_DIR') && !/name: presets/.test(dE), 'the env form: both secretKeyRef env vars, no presets volume, no VIBESPACE_PRESETS_DIR');
const rED = render(CHART, D, ['--set', 'presets.volume=false']);
ok(envNames(docOf(rED, 'Deployment')).includes('VIBESPACE_GDRIVE_CLIENT_ID') && 'gdriveClientSecret' in stringData(docOf(rED, 'Secret')), 'the env form keeps the legacy single pair as it was (CLIENT_ID env + gdriveClientSecret key)');
{
  const have = spawnSync('git', ['-C', REPO, 'cat-file', '-e', `${BASE_SHA}^{commit}`], { env: gitEnvFrom(process.env) }).status === 0;
  if (!have) console.log(`  … SKIP the byte comparison with the pre-lane chart: ${BASE_SHA} is not in this checkout's history (a shallow clone)`);
  else {
    const baseDir = path.join(ROOT, 'base'); fs.mkdirSync(baseDir, { recursive: true });
    const tar = execFileSync('git', ['-C', REPO, 'archive', BASE_SHA, 'deploy/helm/vibespace-user'], { env: gitEnvFrom(process.env), maxBuffer: 16 << 20 });
    spawnSync('tar', ['-x', '-C', baseDir], { input: tar });
    const baseChart = path.join(baseDir, 'deploy/helm/vibespace-user');
    for (const [name, v] of [['A', A], ['C', C], ['D', D]]) ok(render(baseChart, v) === render(CHART, v, ['--set', 'presets.volume=false']), `presets.volume=false renders ${name} BYTE-IDENTICAL to the ${BASE_SHA} chart (an operator who opts out sees no change)`);
    const diffA = render(baseChart, A) !== rA;
    ok(diffA, `(and the default render of A differs from ${BASE_SHA} — the switch is real)`);
  }
}

console.log('F named Secret + mount path');
const rF = render(CHART, C, ['--set', 'presets.clusterSecret=acme-presets', '--set', 'presets.mountPath=/run/acme/presets']);
ok(!volumeVerdict(rF, { cluster: 'acme-presets', mountPath: '/run/acme/presets', release: REL_OV }).length, 'presets.clusterSecret and presets.mountPath reach the source, the mount and VIBESPACE_PRESETS_DIR');

console.log('G the pod template does not depend on the preset values');
ok(depOf(rA) === depOf(render(CHART, B)) && depOf(rA) === depOf(rC) && depOf(rA) === depOf(rD), 'the Deployment renders IDENTICAL for A, B, C, D — adding / changing / removing an override is a Secret-only upgrade: no pod roll, the kubelet re-projects it live');

function chartCopy(tag, patch) {
  const dir = path.join(ROOT, 'ctl-' + tag); fs.cpSync(CHART, dir, { recursive: true });
  const f = path.join(dir, 'templates/main.yaml'); const s = fs.readFileSync(f, 'utf-8'); const p = patch(s);
  if (p === s) throw new Error(`control ${tag}: the patch matched nothing`);
  fs.writeFileSync(f, p); return dir;
}

console.log('H an upgrade that drops an override key removes it (B-8145)');
// helm upgrade = ONE three-way patch per object: original = the last
// release's manifest, modified = the new render, current = the live object. A
// key the original named and the new render does not is patched to null IN
// THE FIELD THE ORIGINAL NAMED IT IN. The API server folds `stringData` into
// `data` and never stores `stringData` — so a dropped stringData key is a null
// on a field that is not there and the stored data key STAYS (the field
// finding, reproduced below on the 2.369.200 chart); a dropped `data` key is
// deleted. A key the original never named (kubectl-added) is left alone.
/** The live Secrets (name → {key: base64}) after installing `nextOut` (oldOut null) or upgrading oldOut → nextOut. */
function helmApply(live, oldOut, nextOut) {
  const out = new Map([...live].map(([n, d]) => [n, { ...d }]));
  const was = new Map((oldOut ? secretDocs(oldOut) : []).map((d) => { const f = secretFields(d); return [f.name, f]; }));
  const now = new Map(secretDocs(nextOut).map((d) => { const f = secretFields(d); return [f.name, f]; }));
  for (const name of was.keys()) if (!now.has(name)) out.delete(name);   // gone from the manifest ⇒ helm deletes the object
  for (const [name, f] of now) {
    const o = was.get(name) || { data: {}, stringData: {} };
    const cur = out.get(name) || {};
    for (const k of Object.keys(o.data)) if (!(k in f.data)) delete cur[k];
    // (a key dropped from stringData: its null lands on the unstored stringData field — nothing to delete)
    for (const [k, v] of Object.entries(f.data)) cur[k] = v;
    for (const [k, v] of Object.entries(f.stringData)) cur[k] = Buffer.from(v, 'utf-8').toString('base64');
    out.set(name, cur);
  }
  return out;
}
/** What the pod sees under override/: the release source's items present in its LIVE Secret. */
function overrideFiles(live, out) {
  const m = docOf(out, 'Deployment').match(/- secret:\n\s+name: (\S+)\n\s+optional: true\n\s+items:\n\s+- \{ key: gdriveClients, path: override\//);
  const sec = m && live.get(m[1]);
  return sec ? ['gdriveClients', 'integrations'].filter((k) => k in sec) : [];
}
/** install `from` (chart, values) then upgrade to `to` (chart, values): the live Secrets + the override files after each. */
function upgrade(from, to) {
  const r1 = render(from[0], from[1]); const live1 = helmApply(new Map(), null, r1);
  const r2 = render(to[0], to[1]); const live2 = helmApply(live1, r1, r2);
  return { before: overrideFiles(live1, r1), after: overrideFiles(live2, r2), live: live2, out: r2 };
}
const A2 = { ...A, gdrive: { clients: [] } };   // the migration step: the legacy Google block dropped (equal to the cluster's), integrations kept
{
  const u = upgrade([CHART, A], [CHART, A2]);
  ok(u.before.join() === 'gdriveClients,integrations' && u.after.join() === 'integrations', `this chart: gdrive.clients dropped ⇒ gdriveClients LEAVES the override Secret and override/ (before ${u.before.join()} · after ${u.after.join()})`);
  const all = upgrade([CHART, A], [CHART, C]);
  ok(all.after.length === 0 && all.live.has(REL_OV) && !Object.keys(all.live.get(REL_OV)).length, 'every block dropped ⇒ the override Secret is empty, nothing projected under override/');
  ok(upgrade([CHART, C], [CHART, A]).after.join() === 'gdriveClients,integrations', '(and the other way: a block added later reaches override/)');
}
{
  const have = spawnSync('git', ['-C', REPO, 'cat-file', '-e', `${PRE_FIX_SHA}^{commit}`], { env: gitEnvFrom(process.env) }).status === 0;
  if (!have) console.log(`  … SKIP the 2.369.200 legs: ${PRE_FIX_SHA} is not in this checkout's history (a shallow clone)`);
  else {
    const preDir = path.join(ROOT, 'prefix'); fs.mkdirSync(preDir, { recursive: true });
    spawnSync('tar', ['-x', '-C', preDir], { input: execFileSync('git', ['-C', REPO, 'archive', PRE_FIX_SHA, 'deploy/helm/vibespace-user'], { env: gitEnvFrom(process.env), maxBuffer: 16 << 20 }) });
    const PRE = path.join(preDir, 'deploy/helm/vibespace-user');
    const repro = upgrade([PRE, A], [PRE, A2]);
    ok(repro.after.includes('gdriveClients'), `the model REPRODUCES B-8145 on the ${PRE_FIX_SHA} chart: gdrive.clients dropped, gdriveClients still projected to override/ (after: ${repro.after.join()})`);
    const mig = upgrade([PRE, A], [CHART, A2]);
    ok(mig.after.join() === 'integrations', `a release on the ${PRE_FIX_SHA} chart upgraded to this one: override/ follows the new values (after: ${mig.after.join()})`);
    const left = mig.live.get('vibespace-alice') || {};
    ok('gdriveClients' in left && 'integrations' in left && !('gdriveClients' in secretNamed(mig.out, 'vibespace-alice').stringData), 'its release Secret still holds the old gdriveClients / integrations (stringData leftovers, no longer projected) — the README\'s kubectl patch removes them');
    ok(depOf(render(PRE, A)) !== depOf(render(CHART, A)), `(the upgrade from ${PRE_FIX_SHA} rolls the pod ONCE — the override source is a new Secret; the README says so)`);
  }
}

console.log('I the app-system switch (appSystem.enabled)');
/** The switch's verdict on a render, as named failures ([] = good): `on` = the env expected, `caps` = capabilities.add expected (in order). */
function appSysVerdict(out, { on, caps }) {
  const dep = depOf(out); const bad = [];
  const n = envNames(dep).filter((e) => e === 'VIBESPACE_APP_SYSTEM').length;
  if (on && !/- name: VIBESPACE_APP_SYSTEM\n\s+value: "1"\n/.test(dep)) bad.push('VIBESPACE_APP_SYSTEM "1" missing');
  if (!on && n) bad.push('VIBESPACE_APP_SYSTEM rendered while off');
  if (n > 1) bad.push(`VIBESPACE_APP_SYSTEM rendered ${n} times`);
  const blocks = [...dep.matchAll(/^\s+capabilities:\n\s+add: (\[.*\])$/gm)];
  const got = blocks.length ? JSON.parse(blocks[0][1]) : [];
  if (blocks.length > 1) bad.push(`${blocks.length} capabilities blocks`);
  if (new Set(got).size !== got.length) bad.push(`a duplicate capability ${JSON.stringify(got)}`);
  else if (got.join() !== caps.join()) bad.push(`capabilities.add ${JSON.stringify(got)}, want ${JSON.stringify(caps)}`);
  const aa = /appArmorProfile:\n\s+type: Unconfined$/m.test(dep);
  if (caps.includes('SYS_ADMIN') !== aa) bad.push(aa ? 'AppArmor Unconfined without SYS_ADMIN' : 'SYS_ADMIN without AppArmor Unconfined');
  if (/^\s+seccompProfile:/m.test(dep)) bad.push('a seccompProfile is set (it must allow mount / unshare / chroot — the chart sets none)');
  return bad;
}
const ON = ['--set', 'appSystem.enabled=true'];
const say = (b) => (b.length ? ' — ' + b.join('; ') : '');
{
  const vOff = appSysVerdict(rC, { on: false, caps: [] });
  ok(!vOff.length && !/^\s+securityContext:\n\s+capabilities:/m.test(depOf(rC)), `off (the default): no VIBESPACE_APP_SYSTEM, no capability, no AppArmor override${say(vOff)}`);
  ok(render(CHART, C, ['--set', 'appSystem.enabled=false']) === rC, 'appSystem.enabled=false renders the same as leaving it out');
  const have = spawnSync('git', ['-C', REPO, 'cat-file', '-e', `${PRE_APPSYS_SHA}^{commit}`], { env: gitEnvFrom(process.env) }).status === 0;
  if (!have) console.log(`  … SKIP the byte comparison with the pre-switch chart: ${PRE_APPSYS_SHA} is not in this checkout's history (a shallow clone)`);
  else {
    const preDir = path.join(ROOT, 'preappsys'); fs.mkdirSync(preDir, { recursive: true });
    spawnSync('tar', ['-x', '-C', preDir], { input: execFileSync('git', ['-C', REPO, 'archive', PRE_APPSYS_SHA, 'deploy/helm/vibespace-user'], { env: gitEnvFrom(process.env), maxBuffer: 16 << 20 }) });
    const PRE = path.join(preDir, 'deploy/helm/vibespace-user');
    ok([A, C, D].every((v) => render(PRE, v) === render(CHART, v)), `off renders A, C, D BYTE-IDENTICAL to the ${PRE_APPSYS_SHA} chart — a release that never sets it sees no change on upgrade`);
    const noComments = (o) => o.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    const shapes = [['fuse', ['--set', 'fuse.enabled=true']], ['cephfs', ['--set', 'cephfs.mons=10.0.0.1', '--set', 'cephfs.secret=k']], ['tun', ['--set', 'tun.enabled=true']]];
    ok(shapes.every(([, x]) => noComments(render(PRE, C, x)) === noComments(render(CHART, C, x))), `fuse / cephfs / tun alone render as the ${PRE_APPSYS_SHA} chart did, comment lines aside (the shared securityContext essay grew)`);
  }
  const rOn = render(CHART, C, ON);
  const vOn = appSysVerdict(rOn, { on: true, caps: ['SYS_ADMIN'] });
  ok(!vOn.length, `on: VIBESPACE_APP_SYSTEM "1" + capabilities.add [SYS_ADMIN] + AppArmor Unconfined, no seccompProfile — the $sysadmin branch forced without fuse or cephfs${say(vOn)}`);
  const vFuse = appSysVerdict(render(CHART, C, [...ON, '--set', 'fuse.enabled=true']), { on: true, caps: ['SYS_ADMIN'] });
  ok(!vFuse.length && /github\.com\/fuse: 1/.test(depOf(render(CHART, C, [...ON, '--set', 'fuse.enabled=true']))), `on + fuse: ONE SYS_ADMIN (no duplicate), one AppArmor override, the fuse device still requested${say(vFuse)}`);
  const vCeph = appSysVerdict(render(CHART, C, [...ON, '--set', 'cephfs.mons=10.0.0.1', '--set', 'cephfs.secret=k']), { on: true, caps: ['SYS_ADMIN'] });
  ok(!vCeph.length, `on + cephfs: ONE SYS_ADMIN${say(vCeph)}`);
  const vTun = appSysVerdict(render(CHART, C, [...ON, '--set', 'tun.enabled=true']), { on: true, caps: ['SYS_ADMIN', 'NET_ADMIN'] });
  ok(!vTun.length, `on + tun: [SYS_ADMIN, NET_ADMIN]${say(vTun)}`);
  const vTunOff = appSysVerdict(render(CHART, C, ['--set', 'tun.enabled=true']), { on: false, caps: ['NET_ADMIN'] });
  ok(!vTunOff.length, `(tun alone, switch off: [NET_ADMIN] and no AppArmor override — the switch leaks into no other branch)${say(vTunOff)}`);
  const vPre = volumeVerdict(rOn, { release: REL_OV });
  ok(!vPre.length && !volumeVerdict(rC, { release: REL_OV }).length, `the presets volume is present by default with the switch on and off${say(vPre)}`);
}

console.log('CONTROLS (chart copies)');
const sub = chartCopy('subpath', (s) => s.replace('              mountPath: {{ $presets.mountPath | default "/etc/vibespace/presets" }}\n              readOnly: true', '              mountPath: {{ $presets.mountPath | default "/etc/vibespace/presets" }}/integrations.json\n              subPath: integrations.json\n              readOnly: true'));
ok(volumeVerdict(render(sub, A), { release: REL_OV }).some((b) => /subPath/.test(b)), 'CONTROL: a subPath mount (the form that never updates) is RED');
const req = chartCopy('required', (s) => s.replace("                  name: {{ $presets.clusterSecret | default \"vibespace-cluster-presets\" }}\n                  optional: true", "                  name: {{ $presets.clusterSecret | default \"vibespace-cluster-presets\" }}"));
ok(volumeVerdict(render(req, A), { release: REL_OV }).some((b) => /cluster source/.test(b)), 'CONTROL: a cluster source without optional:true (a pod that cannot start before the admin makes the Secret) is RED');
const both = chartCopy('envtoo', (s) => s.replace('            - name: VIBESPACE_PRESETS_DIR\n', '            - name: VIBESPACE_INTEGRATIONS\n              valueFrom: { secretKeyRef: { name: {{ $name }}, key: integrations } }\n            - name: VIBESPACE_PRESETS_DIR\n'));
ok(volumeVerdict(render(both, A), { release: REL_OV }).some((b) => /VIBESPACE_INTEGRATIONS/.test(b)), 'CONTROL: a preset env rendered beside the volume is RED');
const sdata = chartCopy('stringdata', (s) => s.replace('data:\n  {{- if $ovG }}\n  gdriveClients: {{ $ovG | toJson | b64enc | quote }}', 'stringData:\n  {{- if $ovG }}\n  gdriveClients: {{ $ovG | toJson | quote }}'));
const us = upgrade([sdata, A], [sdata, A2]);
ok(us.before.includes('gdriveClients') && us.after.includes('gdriveClients'), `CONTROL: an override Secret rendered through stringData KEEPS the dropped gdriveClients projected (after: ${us.after.join()}) — H's first assert is red on it`);

const capsOff = chartCopy('appsys-nocaps', (s) => s.replace('(and .Values.cephfs .Values.cephfs.mons) $appsys }}', '(and .Values.cephfs .Values.cephfs.mons) }}'));
ok(appSysVerdict(render(capsOff, C, ON), { on: true, caps: ['SYS_ADMIN'] }).some((b) => /capabilities\.add|SYS_ADMIN without/.test(b)), 'CONTROL: the env without the forced $sysadmin branch (no SYS_ADMIN, no AppArmor override) is RED');
const capsDup = chartCopy('appsys-dup', (s) => s.replace('add: [{{ if $sysadmin }}"SYS_ADMIN"', 'add: [{{ if $appsys }}"SYS_ADMIN", {{ end }}{{ if $sysadmin }}"SYS_ADMIN"'));
ok(appSysVerdict(render(capsDup, C, [...ON, '--set', 'fuse.enabled=true']), { on: true, caps: ['SYS_ADMIN'] }).some((b) => /duplicate/.test(b)), 'CONTROL: a second SYS_ADMIN for the app system beside fuse is RED');
const envOn = chartCopy('appsys-always', (s) => s.replace('{{- if $appsys }}\n            # App persistence Layer 1', '{{- if true }}\n            # App persistence Layer 1'));
ok(appSysVerdict(render(envOn, C), { on: false, caps: [] }).some((b) => /while off/.test(b)), 'CONTROL: VIBESPACE_APP_SYSTEM rendered while the switch is off is RED');
const secc = chartCopy('appsys-seccomp', (s) => s.replace('            appArmorProfile:\n              type: Unconfined\n', '            appArmorProfile:\n              type: Unconfined\n            seccompProfile:\n              type: RuntimeDefault\n'));
ok(appSysVerdict(render(secc, C, ON), { on: true, caps: ['SYS_ADMIN'] }).some((b) => /seccompProfile/.test(b)), 'CONTROL: a seccompProfile on the container is RED');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
