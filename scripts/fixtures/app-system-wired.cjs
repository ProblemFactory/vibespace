'use strict';
// lane app-system-env — run by scripts/fixtures/app-system-driver.cjs (inside the disposable container ONLY) as a CHILD
// whose own env carries VIBESPACE_APP_SYSTEM=1 (the pod's container env): the apps machine half + engine built as
// server.js builds them (`env: () => agentEnv()` — the sanitizer drops the flag), then the after-listen replay and the
// dialog's status read (GET /api/apps → engine.status). Prints ONE JSON line.
const fs = require('fs');
const { agentEnv } = require('/repo/src/agent-env.js');
const AS = require('/repo/src/app-serve.js');
const E = require('/repo/src/server/apps-engine.js');
(async () => {
  const lines = [], log = { log: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
  for (const d of ['/tmp/vs-wired', '/tmp/vs-wired-eng']) fs.mkdirSync(d, { recursive: true });
  const apps = AS.create({ home: process.env.HOME, stateDir: '/tmp/vs-wired', env: () => agentEnv(process.env), log });
  const call = async (h, op, p) => { const r = await AS.runAppOp(apps, op, p); if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code }); return r; };
  const eng = E.create({ access: { call }, dataDir: '/tmp/vs-wired-eng', log });
  const r = await eng.afterListen();
  const st = await eng.status('local');
  const a = st.appSystem || {};
  process.stdout.write(JSON.stringify({ enabled: a.enabled, blocked: a.blocked || null, helper: a.helper, sanitizedHasFlag: 'VIBESPACE_APP_SYSTEM' in agentEnv(process.env), lines, r }) + '\n');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: String(e && e.stack) }) + '\n'); process.exit(1); });
