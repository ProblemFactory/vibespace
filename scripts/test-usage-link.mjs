#!/usr/bin/env node
// Smoke for the global↔named usage-account link (usage-routes ingestPassiveUsage):
// org-uuid evidence must beat a stale ~/.claude.json email, and a proven-different
// org must BREAK an email match. Runs setupUsage against a temp cache dir + fake deps.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-usage-link-'));
const cacheDir = path.join(tmp, 'usage-cache');
fs.mkdirSync(cacheDir, { recursive: true });

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? 'ok' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// fake express app that records routes; we only need /api/usage's handler
const routes = {};
const app = {
  get: (p, h) => { routes[`GET ${p}`] = h; },
  post: (p, h) => { routes[`POST ${p}`] = h; },
  locals: {},
};

const roster = [
  { id: 'sub-personal', name: 'Personal', type: 'subscription', email: 'personal@example.com' },
  { id: 'sub-work', name: 'Work', type: 'subscription', email: null },
];
let globalStatus = { loggedIn: true, email: 'work@example.com' }; // STALE config identity
const accounts = {
  list: () => ({ accounts: roster }),
  subscriptionStatus: () => globalStatus,
  codexGlobalStatus: () => ({ loggedIn: false, email: null }),
};

const { setupUsage } = require('../src/usage-routes.js');
const usage = setupUsage({
  app, accounts, activeSessions: new Map(),
  serverSetting: () => null,
  ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
  USAGE_CACHE_FILE: path.join(tmp, 'usage.json'),
  USAGE_CACHE_DIR: cacheDir,
  CODEX_SESSIONS_DIR: path.join(tmp, 'codex-sessions'),
  META_DIR: path.join(tmp, 'meta'),
  AVAILABLE_MODELS: { claude: [] },
  BUFFERS_DIR: path.join(tmp, 'buffers'),
});

const write = (key, obj) => fs.writeFileSync(path.join(cacheDir, key + '.json'), JSON.stringify(obj));
const getUsagePayload = () => new Promise((resolve) => {
  routes['GET /api/usage']({}, { json: resolve });
});

// ── scenario 1: no org evidence → email link only (config email matches nobody
// with an email; personal@ matches sub-personal only if config says so) ──
write('__global__', { fiveHour: {}, sevenDay: {}, fetchedAt: 1000 });
write('sub-personal', { fiveHour: {}, sevenDay: {}, fetchedAt: 900 });
let p = await getUsagePayload();
check('S1: stale email (work@) matches no roster email → no link', p.globalLogin.accountId === null);
check('S1: no mismatch flag without org evidence', !p.globalLogin.identityMismatch);

// ── scenario 2: org evidence says global token IS sub-personal (the real
// incident: config email points elsewhere) → org link wins + mismatch flag ──
write('__global__', { fiveHour: {}, sevenDay: {}, fetchedAt: 2000, orgUuid: 'org-AAA', orgName: "personal@example.com's Organization", orgEmail: 'personal@example.com' });
write('sub-personal', { fiveHour: {}, sevenDay: {}, fetchedAt: 1900, orgUuid: 'org-AAA', orgName: "personal@example.com's Organization", orgEmail: 'personal@example.com' });
p = await getUsagePayload();
check('S2: org-uuid equality links global → sub-personal', p.globalLogin.accountId === 'sub-personal');
check('S2: actualEmail = token-derived identity', p.globalLogin.actualEmail === 'personal@example.com');
check('S2: identityMismatch (config says work@, token says personal@)', p.globalLogin.identityMismatch === true);

// ── scenario 3: email match BROKEN by proven-different orgs ──
globalStatus = { loggedIn: true, email: 'personal@example.com' }; // config email matches sub-personal…
write('__global__', { fiveHour: {}, sevenDay: {}, fetchedAt: 3000, orgUuid: 'org-BBB', orgName: "other@example.com's Organization", orgEmail: 'other@example.com' });
write('sub-personal', { fiveHour: {}, sevenDay: {}, fetchedAt: 2900, orgUuid: 'org-AAA' });
p = await getUsagePayload();
check('S3: email match broken — token org differs from the sub’s org', p.globalLogin.accountId === null);
check('S3: mismatch flagged (config personal@ vs token other@)', p.globalLogin.identityMismatch === true);

// ── scenario 4: plain email link still works when orgs agree or are unknown on the sub side ──
write('__global__', { fiveHour: {}, sevenDay: {}, fetchedAt: 4000, orgUuid: 'org-AAA', orgEmail: 'personal@example.com' });
write('sub-personal', { fiveHour: {}, sevenDay: {}, fetchedAt: 3900 }); // sub never refreshed — no orgUuid
p = await getUsagePayload();
check('S4: email link survives when only the global side has org info', p.globalLogin.accountId === 'sub-personal');
check('S4: no mismatch when identities agree', p.globalLogin.identityMismatch === false);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILURES` : '\nall checks passed');
process.exit(failures ? 1 : 0);
