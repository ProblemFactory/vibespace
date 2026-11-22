// B-d8f4 (9): a SUITE's stand-in for the marked walk's child (src/server/marked-walk-child.js) — the same argv, the same one JSON line,
// with PI.membersOf called IN THIS PROCESS, so a suite's stub of membersOf answers the engine's walk as it did before the walk left the
// hub's loop. Never the product's road: src/server/marked-walk.js setRunImpl(inProcessWalker(PI)) in a suite, null to undo.
export const inProcessWalker = (PI) => (cmd, args) => {
  const i = args.findIndex((a) => /marked-walk-child\.js$/.test(String(a)));
  const [mark = '', since = '0', pgid = '0', first = '', procRoot = ''] = args.slice(i + 1);
  const found = PI.membersOf({ mark, since: Number(since) || 0, pgid: Number(pgid) || 0, first: String(first).split(',').map(Number).filter((n) => n > 0) }, procRoot ? { procRoot } : undefined) || [];
  return Promise.resolve({ started: true, code: 0, signal: null, stdout: JSON.stringify({ rows: [...found].map((id) => [Number(id.pid), Number(id.starttime)]), scan: found.scan || null }) + '\n', stderr: '' });
};
