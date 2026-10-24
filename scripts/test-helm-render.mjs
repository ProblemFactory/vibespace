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
//   with the six items (+ L's fleet.json); the blocks are the OVERRIDE, in their OWN Secret
//   `<release>-preset-override` rendered with `data:` (B-8145) — the release
//   Secret carries no preset key.
// B presets.override set beside the legacy blocks ⇒ the override wins.
// C a release WITHOUT any block (a new user) ⇒ the same volume: it inherits
//   the cluster Secret; its override Secret is empty (`data: {}`).
// D the legacy single gdrive.clientId/secret ⇒ one `default` entry in the
//   override list; no gdriveClientSecret key, no env.
// E presets.volume=false ⇒ the env form, as before (+ byte-identical to the
//   pre-lane chart at 2.369.199 when the history is present — else SKIP said;
//   the two ephemeral-storage lines of J aside, as in every byte leg below).
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
// J EVERY POD DECLARES ITS EPHEMERAL STORAGE (lane fleet-helm-ephemeral, B-6911):
//   with no request (= 0) a pod is "over its request" from its first byte, and
//   the kubelet evicts those FIRST when a node's disk fills — the fleet went
//   before the pod filling the disk. Default ⇒ the container's requests carry
//   ephemeral-storage 2Gi and its limits 20Gi, cpu / memory as before; a --set
//   renders through; a values file naming `resources` WITHOUT the key (a
//   private file written before this chart) keeps both (helm merges nested
//   maps); `=null` drops one; the fuse / tun device limits stay beside it;
//   priorityClassName empty ⇒ no field, set ⇒ the pod's. Against the
//   2.369.277 chart (when the history is present) those two lines are the
//   WHOLE diff.
// K THE ROLLOUT RECIPE, modelled: `helm upgrade --reuse-values` swaps the new
//   chart's values.yaml for the release's OLD coalesced values (helm's
//   reuseValues: chart.Values = oldVals) — so an old release upgraded with it
//   alone renders NO ephemeral-storage; with the README's two --set (read out
//   of deploy/README.md, equal to the values.yaml defaults) it renders both.
// L THE FLEET'S SIGN-IN RELAY PAGE RIDES THE PRESETS SECRET (lane oauth-relay-road → lane oauth-relay-one-source, the
//   owner 2026-10-23: «你为啥搞了两套分发 auth client 的方案» — the .344 chart made it an ENV, which moves only at a pod
//   restart, while the client rows beside it moved live): NO VIBESPACE_OAUTH_RELAY_URL in any render; presets.relayUrl
//   ⇒ the override Secret's `fleet` key = {"relayUrl": …} under data: (projected to override/fleet.json); the cluster
//   source projects its `fleet` key to fleet.json; the Deployment BYTE-IDENTICAL with and without a relay (either key) —
//   a relay change is a Secret-only upgrade, no pod roll; the deprecated oauthRelayUrl (a .344 values file, or
//   --reuse-values) renders the SAME Secret; both set ⇒ presets.relayUrl; presets.volume=false ⇒ nothing (byte-identical
//   to no relay); a relay dropped from the values leaves the Secret and override/ (the 3-way model of H).
// N THE NOTES (helm install --dry-run=client against a fake API that answers the four discovery GETs only — no cluster,
//   nothing written): the old key ⇒ a WARNING naming presets.relayUrl / the cluster Secret's `fleet` key; presets.volume
//   =false with a relay ⇒ a WARNING that no relay page reaches the pod; the new key alone / the default ⇒ no warning.
// M THE MAINTAINERS' KEY (lane fleet-feedback-marks — the owner's option B: the maintainers mark a pod's agent feedback
//   from the cluster side): maintainerKeySha empty (the default) ⇒ no VIBESPACE_MAINTAINER_KEY_SHA, the Deployment
//   byte-identical to a render with the key absent; set to a sha256 ⇒ the env with exactly that value (a plain value —
//   a digest, never in a Secret, never a VIBESPACE_MAINTAINER_KEY value env) and nothing else moves; the KEY ITSELF (or
//   any value that is not 64 lowercase hex) REFUSES the render, named. CONTROL: a chart without that refusal renders a
//   key value into the pod's env (RED).
// CONTROLS (chart copies in scratch): the relay env back in the template, the fleet items rendered only when a relay is
//   set (a pod roll per relay change), the old key not aliased — each turns its L assert red; a subPath mount, a source without
//   optional, an env rendered beside the volume — each turns its assert red;
//   the app system's env without the forced caps, a second SYS_ADMIN, the env
//   rendered while off, a seccompProfile — each turns its I assert red; a
//   values.yaml without the ephemeral-storage keys (the chart before J) and a
//   template that drops the key from requests — each turns J's first assert red.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const CHART = path.join(REPO, 'deploy/helm/vibespace-user');
const BASE_SHA = 'b924041f';            // 2.369.199 — the last chart before the volume form
const PRE_FIX_SHA = '0e7dc5b4';         // 2.369.200 — the volume form with the override in the release Secret's stringData (B-8145)
const PRE_APPSYS_SHA = '8d934bb1';      // 2.369.210 — the last chart before appSystem.enabled
const PRE_EPH_SHA = 'f174d5b88';        // 2.369.277 — the last chart without ephemeral-storage (J)
/** A render with J's ephemeral-storage lines taken out — what the byte legs compare against older charts. */
const noEph = (out) => out.replace(/^ {14}ephemeral-storage: \S+\n/gm, '');
/** lane oauth-relay-one-source: a render with L's two fleet.json projection items taken out — what the byte legs compare against older charts. */
const noFleet = (out) => out.replace(/^ {20}- \{ key: fleet, path: (?:override\/)?fleet\.json \}\n/gm, '');
const older = (out) => noFleet(noEph(out));
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
  const src = (name, prefix) => new RegExp(`- secret:\\n\\s+name: ${name}\\n\\s+optional: true\\n\\s+items:\\n\\s+- \\{ key: gdriveClients, path: ${prefix}gdrive-clients\\.json \\}\\n\\s+- \\{ key: integrations, path: ${prefix}integrations\\.json \\}\\n\\s+- \\{ key: fleet, path: ${prefix}fleet\\.json \\}(?:\\n|$)`);
  if (!/- name: presets\n\s+projected:\n\s+sources:/.test(dep)) bad.push('no projected presets volume');
  if (!src(cluster, '').test(dep)) bad.push(`the cluster source ${cluster} (optional, the three items) is missing`);
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
    for (const [name, v] of [['A', A], ['C', C], ['D', D]]) ok(render(baseChart, v) === noEph(render(CHART, v, ['--set', 'presets.volume=false'])), `presets.volume=false renders ${name} BYTE-IDENTICAL to the ${BASE_SHA} chart, J's ephemeral-storage lines aside (an operator who opts out sees no other change)`);
    const diffA = render(baseChart, A) !== rA;
    ok(diffA, `(and the default render of A differs from ${BASE_SHA} — the switch is real)`);
  }
}

console.log('F named Secret + mount path');
const rF = render(CHART, C, ['--set', 'presets.clusterSecret=acme-presets', '--set', 'presets.mountPath=/run/acme/presets']);
ok(!volumeVerdict(rF, { cluster: 'acme-presets', mountPath: '/run/acme/presets', release: REL_OV }).length, 'presets.clusterSecret and presets.mountPath reach the source, the mount and VIBESPACE_PRESETS_DIR');

console.log('G the pod template does not depend on the preset values');
ok(depOf(rA) === depOf(render(CHART, B)) && depOf(rA) === depOf(rC) && depOf(rA) === depOf(rD), 'the Deployment renders IDENTICAL for A, B, C, D — adding / changing / removing an override is a Secret-only upgrade: no pod roll, the kubelet re-projects it live');

function chartCopy(tag, patch, file = 'templates/main.yaml') {
  const dir = path.join(ROOT, 'ctl-' + tag); fs.cpSync(CHART, dir, { recursive: true });
  const f = path.join(dir, file); const s = fs.readFileSync(f, 'utf-8'); const p = patch(s);
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
  return sec ? ['gdriveClients', 'integrations', 'fleet'].filter((k) => k in sec) : [];
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
    ok([A, C, D].every((v) => render(PRE, v) === older(render(CHART, v))), `off renders A, C, D BYTE-IDENTICAL to the ${PRE_APPSYS_SHA} chart, J's ephemeral-storage lines and L's fleet.json items aside — a release that never sets it sees no other change on upgrade`);
    const noComments = (o) => o.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    const shapes = [['fuse', ['--set', 'fuse.enabled=true']], ['cephfs', ['--set', 'cephfs.mons=10.0.0.1', '--set', 'cephfs.secret=k']], ['tun', ['--set', 'tun.enabled=true']]];
    ok(shapes.every(([, x]) => noComments(render(PRE, C, x)) === noComments(older(render(CHART, C, x)))), `fuse / cephfs / tun alone render as the ${PRE_APPSYS_SHA} chart did, comment lines, J's ephemeral-storage lines and L's fleet.json items aside (the shared securityContext essay grew)`);
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

console.log('J every pod declares its ephemeral storage (B-6911)');
/** The app container's `resources:` (the chart's ONE container) → {requests, limits}, values unquoted. */
function resourcesOf(out) {
  const m = depOf(out).match(/^ {10}resources:\n((?: {12,}\S.*\n)+)/m); const r = { requests: {}, limits: {} }; let cur = null;
  for (const line of (m ? m[1] : '').split('\n')) {
    let k;
    if ((k = line.match(/^ {12}(requests|limits):$/))) cur = k[1];
    else if (cur && (k = line.match(/^ {14}(\S+): (.+)$/))) r[cur][k[1]] = k[2].replace(/^"(.*)"$/, '$1');
  }
  return r;
}
const EPH = { req: '2Gi', lim: '20Gi' };   // the values.yaml defaults
const bothMissing = (bad) => ['requests', 'limits'].every((side) => bad.some((b) => b.startsWith(`${side}.ephemeral-storage missing`)));
/** J's verdict on a render, as named failures ([] = good): `req` / `lim` = the ephemeral-storage expected (null = none). */
function ephVerdict(out, { req = EPH.req, lim = EPH.lim } = {}) {
  const r = resourcesOf(out); const bad = [];
  for (const [side, want] of [['requests', req], ['limits', lim]]) {
    const got = r[side]['ephemeral-storage'];
    if (got !== (want ?? undefined)) bad.push(`${side}.ephemeral-storage ${got ?? 'missing'}, want ${want ?? 'none'}`);
  }
  const n = (depOf(out).match(/ephemeral-storage:/g) || []).length;
  if (n !== (req != null) + (lim != null)) bad.push(`${n} ephemeral-storage lines in the Deployment`);
  return bad;
}
const cpuMem = (out) => { const r = resourcesOf(out); return [r.requests.cpu, r.requests.memory, r.limits.cpu, r.limits.memory].join(' '); };
{
  const vC = ephVerdict(rC);
  ok(!vC.length && !ephVerdict(rA).length && !ephVerdict(rD).length, `the default: requests.ephemeral-storage ${EPH.req} + limits.ephemeral-storage ${EPH.lim} on the container (A, C, D)${say(vC)}`);
  ok(cpuMem(rC) === '1 4Gi 8 32Gi', `cpu / memory as before (requests 1 / 4Gi, limits 8 / 32Gi): ${cpuMem(rC)}`);
  const vSet = ephVerdict(render(CHART, C, ['--set', 'resources.requests.ephemeral-storage=5Gi', '--set', 'resources.limits.ephemeral-storage=50Gi']), { req: '5Gi', lim: '50Gi' });
  ok(!vSet.length, `a --set override renders through (5Gi / 50Gi)${say(vSet)}`);
  const own = render(CHART, { ...C, resources: { requests: { cpu: '2', memory: '8Gi' }, limits: { cpu: '16', memory: '64Gi' } } });
  const vOwn = ephVerdict(own);
  ok(!vOwn.length && cpuMem(own) === '2 8Gi 16 64Gi', `a values file naming resources WITHOUT the key (written before this chart) keeps its cpu / memory AND gets both defaults — helm merges nested maps (${cpuMem(own)})${say(vOwn)}`);
  const vNull = ephVerdict(render(CHART, C, ['--set', 'resources.limits.ephemeral-storage=null']), { lim: null });
  ok(!vNull.length, `--set resources.limits.ephemeral-storage=null drops the limit and keeps the request${say(vNull)}`);
  const dev = render(CHART, C, ['--set', 'fuse.enabled=true', '--set', 'tun.enabled=true', '--set', 'tun.mode=device-plugin']);
  const lim = resourcesOf(dev).limits;
  ok(!ephVerdict(dev).length && lim['github.com/fuse'] === '1' && lim['squat.ai/tun'] === '1', `the fuse / tun device limits stay beside it (limits: ${Object.keys(lim).join(', ')})`);
  ok(!/^\s+priorityClassName:/m.test(depOf(rC)) && /^ {6}priorityClassName: vs-interactive$/m.test(depOf(render(CHART, C, ['--set', 'priorityClassName=vs-interactive']))), 'priorityClassName: empty (the default) ⇒ no field (the cluster default); set ⇒ the pod spec carries it');
  const have = spawnSync('git', ['-C', REPO, 'cat-file', '-e', `${PRE_EPH_SHA}^{commit}`], { env: gitEnvFrom(process.env) }).status === 0;
  if (!have) console.log(`  … SKIP the whole-diff comparison with the ${PRE_EPH_SHA} chart: not in this checkout's history (a shallow clone)`);
  else {
    const preDir = path.join(ROOT, 'preeph'); fs.mkdirSync(preDir, { recursive: true });
    spawnSync('tar', ['-x', '-C', preDir], { input: execFileSync('git', ['-C', REPO, 'archive', PRE_EPH_SHA, 'deploy/helm/vibespace-user'], { env: gitEnvFrom(process.env), maxBuffer: 16 << 20 }) });
    const PRE = path.join(preDir, 'deploy/helm/vibespace-user');
    const shapes = [['A', A, []], ['C', C, []], ['D', D, []], ['C+appSystem', C, ON], ['C+fuse+tun', C, ['--set', 'fuse.enabled=true', '--set', 'tun.enabled=true', '--set', 'tun.mode=device-plugin']], ['A env form', A, ['--set', 'presets.volume=false']]];
    const off = shapes.filter(([, v, x]) => { const now = render(CHART, v, x); return render(PRE, v, x) !== older(now) || ephVerdict(now).length; }).map(([n]) => n);
    ok(!off.length, `against the ${PRE_EPH_SHA} chart the two ephemeral-storage lines (and L's two fleet.json items) are the WHOLE diff (${shapes.map(([n]) => n).join(' · ')})${off.length ? ' — differs: ' + off.join(', ') : ''}`);
  }
}

console.log('K the rollout recipe (helm upgrade --reuse-values), modelled');
// helm's upgrade --reuse-values: oldVals = Coalesce(the release's OLD chart, its config); the NEW
// chart's values.yaml is replaced by oldVals (pkg/action/upgrade.go reuseValues). So the templates
// are new, the defaults old: the model is this chart with the pre-J values.yaml, the release's own
// values, plus the command's --set.
const preJ = chartCopy('noeph-values', (s) => s.replace(', ephemeral-storage: "2Gi" }', ' }').replace(', ephemeral-storage: "20Gi" }', ' }'), 'values.yaml');
{
  const readme = fs.readFileSync(path.join(REPO, 'deploy/README.md'), 'utf-8');
  const sets = [...readme.matchAll(/--set (resources\.(requests|limits)\.ephemeral-storage)=(\S+)/g)];
  const want = { requests: EPH.req, limits: EPH.lim };
  ok(sets.length === 2 && sets.every((m) => want[m[2]] === m[3]) && new Set(sets.map((m) => m[2])).size === 2, `the README's recipe names both keys with the values.yaml defaults (${sets.map((m) => m[1] + '=' + m[3]).join(' ') || 'none found'})`);
  const vReuse = ephVerdict(render(preJ, C));
  ok(bothMissing(vReuse), `--reuse-values ALONE on a release from the chart before J renders no ephemeral-storage — the trap the recipe answers (${vReuse.join('; ') || 'rendered both'})`);
  const vRecipe = ephVerdict(render(preJ, C, sets.flatMap((m) => ['--set', `${m[1]}=${m[3]}`])));
  ok(!vRecipe.length, `--reuse-values + the README's two --set renders both${say(vRecipe)}`);
  ok(!ephVerdict(render(CHART, C)).length, '(and a release replayed WITHOUT --reuse-values — its own values over this chart — gets the defaults by itself)');
}

console.log('L the fleet\'s sign-in relay page rides the presets Secret (presets.relayUrl → override/fleet.json — never an env)');
const RELAY = 'https://admin.vibe.example.com/relay/';
/** The override Secret's fleet facts, decoded (undefined = no fleet key). */
const fleetOf = (out) => { const d = dataOf(out, REL_OV); return d.fleet === undefined ? undefined : JSON.parse(d.fleet); };
/** L's verdict, as named failures ([] = good): `want` = the relay page expected in override/fleet.json (null = none); `def` = the Deployment it must equal. */
const relayVerdict = (out, want, def) => {
  const bad = [], dep = depOf(out), f = fleetOf(out);
  if (envNames(dep).includes('VIBESPACE_OAUTH_RELAY_URL')) bad.push('VIBESPACE_OAUTH_RELAY_URL rendered (an env moves only at a pod restart)');
  if ((f ? f.relayUrl : null) !== want) bad.push(`the override's fleet = ${JSON.stringify(f)}, want ${want ? JSON.stringify({ relayUrl: want }) : 'none'}`);
  if (def !== undefined && dep !== def) bad.push('the Deployment differs from the render without a relay (a relay change would roll the pod)');
  return bad;
};
{
  const def = render(CHART, C), on = render(CHART, { ...C, presets: { relayUrl: RELAY } }), old = render(CHART, { ...C, oauthRelayUrl: RELAY });
  const vDef = relayVerdict(def, null), vOn = relayVerdict(on, RELAY, depOf(def)), vOld = relayVerdict(old, RELAY, depOf(def));
  ok(!vDef.length && !Object.keys(dataOf(def, REL_OV)).length, `the default: no relay env, no fleet key in the override Secret (the cluster Secret's key, if the admin set one, is the page)${say(vDef)}`);
  ok(!vOn.length && !Object.keys(secretNamed(on, REL_OV).stringData).length, `--set presets.relayUrl ⇒ the override Secret's fleet = {"relayUrl": …} under data: (never stringData), NO VIBESPACE_OAUTH_RELAY_URL, the Deployment BYTE-IDENTICAL to the render without it — a relay change is a Secret-only upgrade: no pod roll, the kubelet re-projects it, the server re-reads it live${say(vOn)}`);
  ok(!vOld.length && JSON.stringify(dataOf(old, REL_OV)) === JSON.stringify(dataOf(on, REL_OV)), `the DEPRECATED oauthRelayUrl (a .344 values file, --reuse-values) renders the SAME override Secret byte for byte, and no env${say(vOld)}`);
  ok(fleetOf(render(CHART, { ...C, oauthRelayUrl: 'https://old.vibe.example.com/relay/', presets: { relayUrl: RELAY } })).relayUrl === RELAY, 'both keys set: presets.relayUrl wins');
  const vVol = volumeVerdict(on, { release: REL_OV });
  const relS = secretNamed(on, 'vibespace-alice');
  ok(!vVol.length && !('fleet' in relS.data) && !('fleet' in relS.stringData), `the projected volume carries fleet.json from BOTH sources (the cluster Secret's key fleet, the override's); the release Secret holds no fleet key${say(vVol)}`);
  ok(!relayVerdict(render(CHART, { ...A, presets: { relayUrl: RELAY } }), RELAY, depOf(rA)).length && JSON.parse(dataOf(render(CHART, { ...A, presets: { relayUrl: RELAY } }), REL_OV).gdriveClients)[0].key === 'org1', 'beside the per-release blocks (A): fleet sits beside gdriveClients / integrations in the same Secret');
  ok(render(CHART, { ...C, oauthRelayUrl: RELAY }, ['--set', 'presets.volume=false']) === render(CHART, C, ['--set', 'presets.volume=false']), 'presets.volume=false: a relay renders NOTHING (no env, no Secret key) — byte-identical to the render without it (N\'s WARNING says so)');
  const u = upgrade([CHART, { ...C, presets: { relayUrl: RELAY } }], [CHART, C]);
  ok(u.before.join() === 'fleet' && u.after.length === 0, `a relay dropped from the values LEAVES the override Secret and override/ on the same upgrade (data:-rendered; before ${u.before.join()} · after ${u.after.join() || 'none'})`);
  ok(upgrade([CHART, { ...C, oauthRelayUrl: RELAY }], [CHART, { ...C, presets: { relayUrl: RELAY } }]).after.join() === 'fleet', 'moving the old key to presets.relayUrl keeps override/fleet.json projected across the upgrade');
}

console.log('N the install / upgrade NOTES (helm install --dry-run=client; a fake API answering the four discovery GETs)');
{
  const ANS = { '/version': { major: '1', minor: '31', gitVersion: 'v1.31.0', platform: 'linux/amd64' }, '/api': { kind: 'APIVersions', versions: ['v1'], serverAddressByClientCIDRs: [] }, '/apis': { kind: 'APIGroupList', apiVersion: 'v1', groups: [] }, '/api/v1': { kind: 'APIResourceList', groupVersion: 'v1', resources: [] } };
  const asked = [];
  const api = http.createServer((q, r) => { const p = q.url.split('?')[0]; asked.push(`${q.method} ${p}`); const b = ANS[p]; r.writeHead(b ? 200 : 404, { 'content-type': 'application/json' }); r.end(JSON.stringify(b || { kind: 'Status', code: 404 })); });
  await new Promise((res) => api.listen(0, '127.0.0.1', res));
  const kc = path.join(ROOT, 'kubeconfig'), rel = path.join(ROOT, 'releases.yaml');
  fs.writeFileSync(rel, '[]\n');
  fs.writeFileSync(kc, `apiVersion: v1\nkind: Config\nclusters: [{name: fake, cluster: {server: "http://127.0.0.1:${api.address().port}"}}]\ncontexts: [{name: fake, context: {cluster: fake, user: fake}}]\ncurrent-context: fake\nusers: [{name: fake, user: {}}]\n`);
  /** `helm install --dry-run=client` (async: the fake API answers on this loop) → {status, notes}. */
  const notesOf = (values) => new Promise((res) => {
    const f = path.join(ROOT, `values-${++n}.json`); fs.writeFileSync(f, JSON.stringify(values));
    const c = spawn('helm', ['install', 'u-' + values.user, CHART, '--dry-run=client', '-f', f], { env: { ...process.env, KUBECONFIG: kc, HELM_DRIVER: 'memory', HELM_MEMORY_DRIVER_DATA: rel } });
    let o = '', e = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { e += d; });
    c.on('close', (status) => { const i = o.indexOf('NOTES:'); res({ status, notes: i >= 0 ? o.slice(i) : '', err: e.split('\n')[0] }); });
  });
  const nOld = await notesOf({ ...C, oauthRelayUrl: RELAY }), nNew = await notesOf({ ...C, presets: { relayUrl: RELAY } }), nDef = await notesOf(C), nOff = await notesOf({ ...C, presets: { relayUrl: RELAY, volume: false } });
  ok(nOld.status === 0 && /WARNING: oauthRelayUrl is deprecated/.test(nOld.notes) && /presets\.relayUrl/.test(nOld.notes) && /`fleet` key/.test(nOld.notes) && /override\/fleet\.json/.test(nOld.notes), 'the old key ⇒ the NOTES WARN: deprecated, move it to presets.relayUrl or the cluster Secret\'s fleet key', nOld.notes || nOld.err);
  ok(nNew.status === 0 && nDef.status === 0 && !/WARNING/.test(nNew.notes) && !/WARNING/.test(nDef.notes), 'presets.relayUrl alone, and the default: no warning', JSON.stringify([nNew.notes, nDef.notes, nNew.err]));
  ok(nOff.status === 0 && /WARNING: presets\.volume=false/.test(nOff.notes) && /gets none/.test(nOff.notes), 'presets.volume=false with a relay ⇒ the NOTES WARN that no relay page reaches the pod', nOff.notes || nOff.err);
  ok(asked.length > 0 && asked.every((x) => /^GET \/(version|api|apis|api\/v1)$/.test(x)), `the fake API saw discovery GETs only — nothing was written (${[...new Set(asked)].join(', ')})`);
  await new Promise((res) => api.close(res));
}

console.log('M the maintainers\' key (maintainerKeySha → VIBESPACE_MAINTAINER_KEY_SHA)');
const MSHA = 'e0dc9579d14000f912d66151c124f72bc8307bf50d6bbe568840453782ccab3e';
const MKEY_VALUE = 'vsmk_' + 'Q'.repeat(43);
const maintVerdict = (out, want) => {
  const dep = depOf(out), bad = [];
  const env = envNames(dep), n = env.filter((e) => e === 'VIBESPACE_MAINTAINER_KEY_SHA').length;
  const val = (dep.match(/- name: VIBESPACE_MAINTAINER_KEY_SHA\n\s+value: "([^"]*)"/) || [])[1];
  if (!want && n) bad.push('VIBESPACE_MAINTAINER_KEY_SHA rendered with no sha set');
  if (want && val !== want) bad.push(`the env value is ${JSON.stringify(val)}, not the sha set`);
  if (val !== undefined && !/^[0-9a-f]{64}$/.test(val)) bad.push('the env value is not a sha256 (a KEY in the pod\'s env)');
  if (n > 1) bad.push('the env twice');
  if (env.includes('VIBESPACE_MAINTAINER_KEY')) bad.push('a key VALUE env rendered');
  if (want && secretDocs(out).some((d) => d.includes(want))) bad.push('the sha in a Secret');
  return bad;
};
const renderErr = (values) => { const f = path.join(ROOT, `values-${++n}.json`); fs.writeFileSync(f, JSON.stringify(values)); const r = spawnSync('helm', ['template', 'u-' + values.user, CHART, '-f', f], { encoding: 'utf-8' }); return r.status === 0 ? null : String(r.stderr || r.error || 'failed'); };
{
  const def = render(CHART, C), withKey = render(CHART, { ...C, maintainerKeySha: '' }), on = render(CHART, { ...C, maintainerKeySha: MSHA });
  ok(!maintVerdict(def, null).length && depOf(def) === depOf(withKey), `the default (and an explicit empty value) renders no VIBESPACE_MAINTAINER_KEY_SHA — the Deployment byte-identical either way${say(maintVerdict(def, null))}`);
  ok(!maintVerdict(on, MSHA).length, `--set maintainerKeySha=<sha256> ⇒ the env with exactly that sha, a plain value (never a Secret, never a key value)${say(maintVerdict(on, MSHA))}`);
  const strip = (d) => d.replace(/\n\s+# The maintainers' key, by its sha256 ONLY[\s\S]*?- name: VIBESPACE_MAINTAINER_KEY_SHA\n\s+value: "[^"]*"/, '');
  ok(strip(depOf(on)) === depOf(def), 'nothing else in the Deployment moves (the env block is the WHOLE diff)');
  const refused = [MKEY_VALUE, MSHA.toUpperCase(), MSHA.slice(1), 'yes'].map((v) => [v.slice(0, 12), renderErr({ ...C, maintainerKeySha: v })]);
  ok(refused.every(([, e]) => e && /maintainerKeySha is the maintainer key's sha256 \(64 lowercase hex\) — never the key itself/.test(e)), 'the KEY ITSELF, an uppercase sha, 63 hex, a word ⇒ the render REFUSES, named (a key never reaches a pod by a slip)', JSON.stringify(refused.map(([v, e]) => [v, e && e.split('\n')[0]])));
  ok(!maintVerdict(render(CHART, { ...A, maintainerKeySha: MSHA }), MSHA).length && !volumeVerdict(render(CHART, { ...A, maintainerKeySha: MSHA }), { release: REL_OV }).length, 'beside the presets volume (a release with the blocks): the env and the volume form both hold');
}

console.log('CONTROLS (chart copies)');
{
  const def = depOf(render(CHART, C));
  const envBack = chartCopy('relay-env', (x) => x.replace('              value: {{ printf "https://%s" $host | quote }}\n', '              value: {{ printf "https://%s" $host | quote }}\n            {{- with $relay }}\n            - name: VIBESPACE_OAUTH_RELAY_URL\n              value: {{ . | quote }}\n            {{- end }}\n'));
  ok(relayVerdict(render(envBack, { ...C, presets: { relayUrl: RELAY } }), RELAY, def).some((b) => /VIBESPACE_OAUTH_RELAY_URL rendered/.test(b)), 'CONTROL: the relay env back in the template (the .344 road) is RED');
  const rolls = chartCopy('relay-items-by-value', (x) => x.replace('                    - { key: fleet, path: override/fleet.json }\n', '                    {{- if $relay }}\n                    - { key: fleet, path: override/fleet.json }\n                    {{- end }}\n'));
  ok(relayVerdict(render(rolls, { ...C, presets: { relayUrl: RELAY } }), RELAY, depOf(render(rolls, C))).some((b) => /Deployment differs/.test(b)), 'CONTROL: fleet items rendered only when a relay is set (every relay change rolls the pod) is RED');
  const noAlias = chartCopy('relay-no-alias', (x) => x.replace('{{- $relay := $presets.relayUrl | default .Values.oauthRelayUrl -}}', '{{- $relay := $presets.relayUrl -}}'));
  ok(relayVerdict(render(noAlias, { ...C, oauthRelayUrl: RELAY }), RELAY, def).some((b) => /the override's fleet/.test(b)), 'CONTROL: a chart that drops the old key (a --reuse-values upgrade from .344 loses its relay page) is RED');
}
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
ok(bothMissing(ephVerdict(render(preJ, C))), 'CONTROL: a values.yaml without the ephemeral-storage keys (the chart before J) is RED on both');
const reqDrop = chartCopy('eph-template', (s) => s.replace('requests: {{- toYaml .Values.resources.requests | nindent 14 }}', 'requests: {{- toYaml (omit .Values.resources.requests "ephemeral-storage") | nindent 14 }}'));
ok(ephVerdict(render(reqDrop, C)).some((b) => /^requests\.ephemeral-storage missing/.test(b)), 'CONTROL: a template that drops the key from requests is RED');

const maintNoGuard = chartCopy('maint-no-guard', (s) => s.replace(/\{\{- with \.Values\.maintainerKeySha \}\}\{\{ if not \(regexMatch [^\n]*\n/, ''), 'templates/_helpers.tpl');
ok(maintVerdict(render(maintNoGuard, { ...C, maintainerKeySha: MKEY_VALUE }), MKEY_VALUE).some((b) => /not a sha256/.test(b)), 'CONTROL: a chart without the sha refusal renders the KEY into the pod\'s env — RED');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
