// THE RAW /usage PROBE LOG (2.369.109, owner 2026-09-17: "把最近一段时间的所有的
// /usage 的 raw 返回结果和对应的 parse 结果保存起来方便 debug").
//
// Every probe that asks the vendor for a quota panel — the `claude -p /usage`
// panel rung (the ⟳ button + the auto-cli loop) and the live session's
// `control:get_usage` rung — appends ONE line here with what it SENT (the
// account key, the credential dir, the argv, the machine-wide `~/.claude.json`
// oauthAccount BEFORE and AFTER the spawn — the org context B-855a hinges on),
// what came BACK verbatim (stdout/stderr, clipped), what the parser MADE of it
// and what the write path DID with it (written / refused / discarded, with the
// reason). A ring of two files: `data/usage-probe-log.ndjson` rotates to `.1`
// at MAX_BYTES, so "the last few days" survive a restart and a reader can
// diff raw ⇄ parsed ⇄ stored without reproducing a probe.
//
// Zero vendor calls (§ban-safety): this module only records what the two
// allowlisted producers already did. Secrets never enter it: the panel text
// carries no token, env values are not recorded (only the creds DIR path).
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = 'usage-probe-log.ndjson';
const MAX_BYTES = 8 * 1024 * 1024;   // per file; two files kept
const RAW_CAP = 32 * 1024;           // a /usage panel is ~1-3 KB; a runaway stderr is clipped, never dropped
const ERR_CAP = 8 * 1024;

function clip(s, n) {
  s = s == null ? '' : String(s);
  return s.length > n ? s.slice(0, n) + `\n…[+${s.length - n} chars clipped]` : s;
}

/** The machine-wide login the CLI reads its org context from (`~/.claude.json`
 *  oauthAccount) — recorded beside every probe because it is the ONE input the
 *  probe does not control: whichever CLI process last rewrote it decides which
 *  org's panel comes back (the B-855a mechanism). Reads nothing else. */
function machineOauthAccount(home = process.env.HOME || '') {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
    const o = j && j.oauthAccount;
    if (!o || typeof o !== 'object') return null;
    return { email: o.emailAddress || null, orgUuid: o.organizationUuid || null, orgName: o.organizationName || null };
  } catch { return null; }
}

/** Append one probe record. `rec` = {rung:'panel'|'control', key, name, …}. */
function appendProbeLog(dataDir, rec, { maxBytes = MAX_BYTES } = {}) {
  try {
    if (!dataDir) return false;
    fs.mkdirSync(dataDir, { recursive: true });
    const f = path.join(dataDir, FILE);
    const out = { at: Date.now(), ...rec };
    if ('rawStdout' in out) out.rawStdout = clip(out.rawStdout, RAW_CAP);
    if ('rawStderr' in out) out.rawStderr = clip(out.rawStderr, ERR_CAP);
    const line = JSON.stringify(out) + '\n';
    let size = 0; try { size = fs.statSync(f).size; } catch { }
    if (size > 0 && size + line.length > maxBytes) { try { fs.renameSync(f, f + '.1'); } catch { } }
    fs.appendFileSync(f, line);
    return true;
  } catch { return false; }
}

/** The last `limit` records (oldest first), optionally for one account key,
 *  across the rotated file and the live one. */
function readProbeLog(dataDir, { limit = 200, key = null, rung = null } = {}) {
  const rows = [];
  for (const name of [FILE + '.1', FILE]) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dataDir, name), 'utf8'); } catch { continue; }
    for (const l of txt.split('\n')) {
      if (!l) continue;
      try { rows.push(JSON.parse(l)); } catch { }
    }
  }
  const sel = rows.filter((r) => (!key || r.key === key) && (!rung || r.rung === rung));
  return sel.slice(Math.max(0, sel.length - Math.max(1, limit | 0)));
}

module.exports = { appendProbeLog, readProbeLog, machineOauthAccount, clip, FILE, MAX_BYTES, RAW_CAP, ERR_CAP };
