#!/usr/bin/env node
// make-vault-run-card-facts — writes scripts/fixtures/vault-run-card-facts.json FROM src/vault-run.js `cardFactsOf` over three
// REAL shapes (lane vault-agent-own r20; the owner 2026-10-27 «这个卡片的可读性很差»). The fixture is the owner's run card as the
// STRUCTURED `facts` field the client (lane wake-approve-card r7) renders with t() keys — shared byte-for-byte with that lane
// (int-C diff-checks it). `buildFixture()` is exported so the gate (test-vault-run) re-derives it and fails on any drift from
// cardFactsOf. The inputs are genericised (a fixed `~` home, no personal/company paths) so the bytes are deterministic.
//
//   variant «hosts-unknown»       — the owner's unifi-api.sh: an agent-writable program, two env secrets, NO host it declares
//   variant «hosts-known-always»  — psql to a named host, one env secret, «总是允许» offered
//   variant «config-reads»        — curl -K with a $VAULT_FILE config template that nests a read ⇒ «总是允许» withheld, host config-driven
//   variant «late»                — a MINTED own value minted for one host, this run sends it to ANOTHER (reason.away: minted for X, sent to Y)
// round 23 (v2): each variant carries the TEMPLATE TEXT (shown), the plain env, and the reason CODES (secrets[].own/provenance/forHost/sendsTo,
// reason.away/notOwn); every string is bounded to CARD_STRING_MAX with a cut marker + a chunked fold. See /var/tmp/vibespace-lanes/vault-card-contract.md.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VR = require(path.join(REPO, 'src/vault-run.js'));
export const FIXTURE_PATH = path.join(REPO, 'scripts/fixtures/vault-run-card-facts.json');

const HOME = '/home/user';
const factsOf = (req, cwd, names) => {
  const plan = VR.planOf(req);
  if (!plan.ok) throw new Error(`a fixture plan did not parse: ${plan.code} ${plan.why || ''}`);
  return VR.cardFactsOf(plan, VR.shapeOf(plan), cwd, { home: HOME, ...names });
};

export function buildFixture() {
  const hostsUnknown = factsOf(
    { argv: ['./office-net/unifi-api.sh', 'PUT', '/proxy/network/api/s/default/rest/wan', '/tmp/unifi-work/wan2.json'],
      env: [['UNIFI_USER', 'vault://secrets/unifi-account/username'], ['UNIFI_PASS', 'vault://secrets/unifi-account/password']],
      resolved: `${HOME}/workspace/ops/office-net/unifi-api.sh`, programWritable: true },
    `${HOME}/workspace/ops`,
    { who: '设备管理', cmd: './office-net/unifi-api.sh PUT /proxy/network/api/s/default/rest/wan /tmp/unifi-work/wan2.json',
      entries: { 'secrets:unifi-account#username': 'UniFi 账号 · 用户名', 'secrets:unifi-account#password': 'UniFi 账号 · 密码' },
      refsInfo: [{ id: 'secrets:unifi-account#username', own: true, prov: 'stored', open: true }, { id: 'secrets:unifi-account#password', own: true, prov: 'stored', open: true }],
      away: [{ id: 'secrets:unifi-account#username', ref: 'vault://secrets/unifi-account/username', forHost: null, unknown: true, keep: false }, { id: 'secrets:unifi-account#password', ref: 'vault://secrets/unifi-account/password', forHost: null, unknown: true, keep: false }] });

  const hostsKnownAlways = factsOf(
    { argv: ['psql', '-h', 'db.example.com', '-U', 'svc', '-c', 'select 1'],
      env: [['PGPASSWORD', 'vault://secrets/prod-db/password']], resolved: '/usr/bin/psql', programWritable: false },
    `${HOME}/workspace/ops`,
    { who: '运维', cmd: "psql -h db.example.com -U svc -c 'select 1'", entries: { 'secrets:prod-db#password': '生产数据库 · 密码' },
      refsInfo: [{ id: 'secrets:prod-db#password', own: false, open: true }], away: [], notOwn: false });

  const configReads = factsOf(
    { argv: ['curl', '-sS', '-K', '$VAULT_FILE{B}'], file: [['B', '@b.cfg']],
      templates: { 'b.cfg': 'config ./more.cfg\nheader = "X-Auth: $VAULT{secrets/api-token/token}"\n' },
      resolved: '/usr/bin/curl', programWritable: false },
    `${HOME}/workspace/ops`,
    { who: '运维', cmd: 'curl -sS -K $VAULT_FILE{B}', entries: { 'secrets:api-token#token': 'API 令牌' },
      refsInfo: [{ id: 'secrets:api-token#token', own: false, open: true }], away: [] });

  const lateAway = factsOf(
    { argv: ['curl', '-sS', 'https://api.external.example/v1/push'],
      env: [['X_AUTH_TOKEN', 'vault://secrets/mint-token/token']], resolved: '/usr/bin/curl', programWritable: false },
    `${HOME}/workspace/ops`,
    { who: '集成', cmd: 'curl -sS https://api.external.example/v1/push',
      entries: { 'secrets:mint-token#token': '集成令牌（铸造）' },
      refsInfo: [{ id: 'secrets:mint-token#token', own: true, prov: 'minted', forHost: 'auth.internal.example', open: true }],
      away: [{ id: 'secrets:mint-token#token', ref: 'vault://secrets/mint-token/token', forHost: 'auth.internal.example', host: 'api.external.example', unknown: false, keep: true }] });

  return {
    v: 2,
    _: 'Generated by scripts/make-vault-run-card-facts.mjs from src/vault-run.js cardFactsOf (lane vault-agent-own r20 / wake-approve-card r7). The owner\'s run card as structured facts (codes, not prose), rendered by the client with t() keys. Do not hand-edit — run `node scripts/make-vault-run-card-facts.mjs`. Shared byte-for-byte with lane wake-approve-card (int-C).',
    codes: { always_why: VR.ALWAYS_WHY, hosts_why: VR.HOSTS_WHY, masking: VR.MASKING, shape: VR.CARD_SHAPES },
    variants: [
      { name: 'hosts-unknown', facts: hostsUnknown },
      { name: 'hosts-known-always', facts: hostsKnownAlways },
      { name: 'config-reads', facts: configReads },
      { name: 'late', facts: lateAway },
    ],
  };
}

export const FIXTURE_TEXT = () => JSON.stringify(buildFixture(), null, 2) + '\n';

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, FIXTURE_TEXT());
  console.log(`wrote ${path.relative(REPO, FIXTURE_PATH)} (${Buffer.byteLength(FIXTURE_TEXT())} bytes)`);
}
