#!/usr/bin/env node
// THE UPDATE ROAD'S RUNTIME CHECK (lane runtime-floor, 2026-10-22). scripts/update.sh (the hub AND a pod — ⚙ Update
// VibeSpace… runs it) calls this after the pull and the build, before the restart; the server's boot runs the same
// check after its auto-update. The node the NEXT start runs on — the instance's own (data/runtime/current, when it is
// newer) or the base one (the node running this script: the unit's / the image's) — against THE floor table
// (src/runtime-floor.js); below it, with --provision, the product downloads the fixed release for itself
// (src/node-runtime.js: sha256 against the mirror's SHASUMS256.txt, then current flips) and the restart runs on it.
// Never fails the update: exit 0 whatever happened (the server keeps the node it has), 2 = a usage error.
//   node scripts/runtime-check.mjs [--provision] [--root <data dir>] [--mirror <url>] [--json]
//   VIBESPACE_NODE_MIRROR = the mirror (the device installer's name for it; default https://nodejs.org/dist)
//   VIBESPACE_RUNTIME_BASE = the base version to judge (a scratch suite's seam — the node running this script otherwise)
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RF = require(path.join(REPO, 'src/runtime-floor.js'));
const NR = require(path.join(REPO, 'src/node-runtime.js'));

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
for (const a of args) if (a.startsWith('--') && !['--provision', '--root', '--mirror', '--json'].includes(a)) { console.error(`runtime-check: unknown flag ${a}`); process.exit(2); }
const root = path.resolve(opt('--root') || path.join(REPO, 'data'));
const mirror = opt('--mirror') || process.env.VIBESPACE_NODE_MIRROR || NR.DEFAULT_MIRROR;
const base = process.env.VIBESPACE_RUNTIME_BASE || process.version;

const own = NR.currentOf(root);
const runs = own && RF.compare(own.version, base) === 1 ? own.version : base;   // what the next start runs on
const v = RF.verdict(runs);
const out = { base, own: own ? own.version : null, runs, verdict: v, provisioned: null };
const say = (l) => { if (!flag('--json')) console.log(l); };
if (v.state === 'ok') say(`[runtime] node ${runs} — at or above the floor ${v.floor} (${v.advisory})`);
else if (v.state === 'unknown-major') say(`[runtime] node ${runs} — the floor table names no line for v${v.major} (src/runtime-floor.js); nothing to provision`);
else if (v.state === 'unknown') say(`[runtime] node ${runs} — not a version this check reads`);
else if (!flag('--provision')) say(`[runtime] node ${runs} below the floor ${v.floor} (${v.advisory}) — run with --provision to install ${v.wanted} for this instance`);
else {
  say(`[runtime] node ${runs} below the floor ${v.floor} (${v.advisory}) — provisioning ${v.wanted} under ${path.join(root, 'runtime')}`);
  out.provisioned = await NR.provision(v.wanted, { root, mirror, log: say });
  if (out.provisioned.ok) say(`[runtime] ${v.wanted} ready at ${path.join(root, 'runtime', 'current')} — the restart runs on it`);
  else say(`[runtime] not provisioned (${out.provisioned.code}): ${out.provisioned.error} — the server keeps ${runs}`);
}
if (flag('--json')) console.log(JSON.stringify(out));
process.exit(0);
