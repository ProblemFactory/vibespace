// The mint child's env is an ALLOWLIST (oat-verify F2), so a suite's FAKE_OAT_*
// knobs ride in a per-run wrapper script instead of the hub env — HEX-encoded,
// so no token bytes sit on disk for test-oat-mint's file-write spy to find.
import fs from 'node:fs';
import path from 'node:path';
const FAKE = path.join(path.dirname(new URL(import.meta.url).pathname), 'fake-claude');
let n = 0;
export function fakeClaudeCmd(dir, vars = {}) {
  const f = path.join(dir, `fake-claude-${process.pid}-${++n}.sh`);
  const ex = Object.entries(vars).filter(([, v]) => v != null).map(([k, v]) => `export FAKE_OAT_HEX_${k}=${Buffer.from(String(v)).toString('hex')}`).join('\n');
  fs.writeFileSync(f, `#!/bin/sh\n${ex}\nexec "${FAKE}" "$@"\n`, { mode: 0o700 });
  return f;
}
