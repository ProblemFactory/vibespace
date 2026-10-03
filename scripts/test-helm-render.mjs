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
//   (the cluster Secret, the release's own) both optional:true with the four
//   items; the release Secret carries its blocks as the OVERRIDE (keys unchanged).
// B presets.override set beside the legacy blocks ⇒ the override wins.
// C a release WITHOUT any block (a new user) ⇒ the same volume: it inherits
//   the cluster Secret; its own Secret has no preset key.
// D the legacy single gdrive.clientId/secret ⇒ one `default` entry in the
//   override list; no gdriveClientSecret key, no env.
// E presets.volume=false ⇒ the env form, as before (+ byte-identical to the
//   pre-lane chart at 2.369.199 when the history is present — else SKIP said).
// F clusterSecret / mountPath named ⇒ the source and the mount follow.
// G THE POD TEMPLATE IS THE SAME for A, B, C, D: the item list never depends
//   on the values, so changing an override is a Secret-only upgrade — no roll.
// CONTROLS (chart copies in scratch): a subPath mount, a source without
//   optional, an env rendered beside the volume — each turns its assert red.
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
const ROOT = scratch('cpr');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });

const hv = spawnSync('helm', ['version', '--short'], { encoding: 'utf-8' });
if (hv.status !== 0) { console.log(`  … SKIP the whole suite: no helm on PATH (${(hv.error && hv.error.code) || hv.stderr}) — this gate is BLIND here; run it where helm exists`); console.log('\nALL PASS (0)'); process.exit(0); }
console.log(`  … helm ${hv.stdout.trim()}`);

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
const vA = volumeVerdict(rA, { release: 'vibespace-alice' });
ok(!vA.length, `the volume form: no preset env, VIBESPACE_PRESETS_DIR, a read-only mount (no subPath), two optional sources with their items${vA.length ? ' — ' + vA.join('; ') : ''}`);
const sA = stringData(docOf(rA, 'Secret'));
ok(sA.gdriveClients && JSON.parse(sA.gdriveClients)[0].key === 'org1' && JSON.parse(sA.integrations)[0].key === 'jarvis', 'the release Secret keeps its keys (gdriveClients / integrations) — now the OVERRIDE layer projected to override/');
ok(!/GOCSPX-|lark-alice-secret/.test(docOf(rA, 'Deployment')), 'no credential in the Deployment (every value is in the Secret)');

console.log('B presets.override wins over the legacy block');
const sB = stringData(docOf(render(CHART, B), 'Secret'));
ok(JSON.parse(sB.gdriveClients).map((c) => c.key).join() === 'mine' && JSON.parse(sB.integrations)[0].key === 'jarvis', 'presets.override.gdriveClients replaces gdrive.clients in the Secret; integrations falls back to the legacy block');

console.log('C a release without any block ⇒ inherits');
const rC = render(CHART, C);
const vC = volumeVerdict(rC, { release: 'vibespace-alice' });
ok(!vC.length, `the same volume — the cluster Secret reaches a new user with no block of her own${vC.length ? ' — ' + vC.join('; ') : ''}`);
const sC = stringData(docOf(rC, 'Secret'));
ok(!('gdriveClients' in sC) && !('integrations' in sC) && !('gdriveClientSecret' in sC), 'her own Secret carries no preset key (optional:true projects nothing for it)');

console.log('D the legacy single client');
const rD = render(CHART, D);
const sD = stringData(docOf(rD, 'Secret'));
const dl = sD.gdriveClients ? JSON.parse(sD.gdriveClients) : [];
ok(dl.length === 1 && dl[0].key === 'default' && dl[0].clientId === 'legacy.apps.googleusercontent.com' && !('gdriveClientSecret' in sD), 'gdrive.clientId/secret becomes ONE override entry keyed default (the env rung named it so); no gdriveClientSecret key');
ok(!volumeVerdict(rD, { release: 'vibespace-alice' }).length, 'and the volume form, no env');

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
ok(!volumeVerdict(rF, { cluster: 'acme-presets', mountPath: '/run/acme/presets', release: 'vibespace-alice' }).length, 'presets.clusterSecret and presets.mountPath reach the source, the mount and VIBESPACE_PRESETS_DIR');

console.log('G the pod template does not depend on the preset values');
const depOf = (out) => docOf(out, 'Deployment');
ok(depOf(rA) === depOf(render(CHART, B)) && depOf(rA) === depOf(rC) && depOf(rA) === depOf(rD), 'the Deployment renders IDENTICAL for A, B, C, D — adding / changing / removing an override is a Secret-only upgrade: no pod roll, the kubelet re-projects it live');

console.log('CONTROLS (chart copies)');
function chartCopy(tag, patch) {
  const dir = path.join(ROOT, 'ctl-' + tag); fs.cpSync(CHART, dir, { recursive: true });
  const f = path.join(dir, 'templates/main.yaml'); const s = fs.readFileSync(f, 'utf-8'); const p = patch(s);
  if (p === s) throw new Error(`control ${tag}: the patch matched nothing`);
  fs.writeFileSync(f, p); return dir;
}
const sub = chartCopy('subpath', (s) => s.replace('              mountPath: {{ $presets.mountPath | default "/etc/vibespace/presets" }}\n              readOnly: true', '              mountPath: {{ $presets.mountPath | default "/etc/vibespace/presets" }}/integrations.json\n              subPath: integrations.json\n              readOnly: true'));
ok(volumeVerdict(render(sub, A), { release: 'vibespace-alice' }).some((b) => /subPath/.test(b)), 'CONTROL: a subPath mount (the form that never updates) is RED');
const req = chartCopy('required', (s) => s.replace("                  name: {{ $presets.clusterSecret | default \"vibespace-cluster-presets\" }}\n                  optional: true", "                  name: {{ $presets.clusterSecret | default \"vibespace-cluster-presets\" }}"));
ok(volumeVerdict(render(req, A), { release: 'vibespace-alice' }).some((b) => /cluster source/.test(b)), 'CONTROL: a cluster source without optional:true (a pod that cannot start before the admin makes the Secret) is RED');
const both = chartCopy('envtoo', (s) => s.replace('            - name: VIBESPACE_PRESETS_DIR\n', '            - name: VIBESPACE_INTEGRATIONS\n              valueFrom: { secretKeyRef: { name: {{ $name }}, key: integrations } }\n            - name: VIBESPACE_PRESETS_DIR\n'));
ok(volumeVerdict(render(both, A), { release: 'vibespace-alice' }).some((b) => /VIBESPACE_INTEGRATIONS/.test(b)), 'CONTROL: a preset env rendered beside the volume is RED');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
