// THE STRIP'S ONE TABLE (lane mask-value-shape, the chat status strip step two — the owner accepted the arrangement on
// 2026-11-14 and asked again on 2026-11-17 «这个优化呢？»; spec: /var/tmp/vibespace-lanes/chat-status-strip/page.md §1 / §4).
// PURE: no DOM, no words. Every mark the chat window's status strip can draw is ONE row here: its class (by what a person
// needs to KNOW or OPERATE — never by «normal or abnormal»), where it lives (a strip row, inside a door, or a home off the
// strip), its fixed order, whether it exists only while its thing does, and its short form by width. The bar draws from
// `arrange()`; scripts/test-strip-table.mjs reads the bar's source and reds a mark it draws that this table does not place
// on the strip — what keeps the strip from growing back to four rows one chip at a time.
//
// THE CLASSES (the owner, 2026-11-14 01:23Z):
//   I   ALWAYS SEEN — read at every moment, though rarely changed: row 1
//   II  ALWAYS FINDABLE — a fixed place whatever the frequency: row 2
//   III LOW-FREQUENCY operations and states — inside ONE door «对话设置» (row 2's last), each row its present value
//   IV  DETAILS — off the strip: behind the context door, in ⚙ Diagnostics, in Session Properties, in the title bar
//
// PLACES: 'row1' · 'row2' · 'in:<door>' (drawn inside that door's panel, never on the strip) · 'home:<where>' (said
// elsewhere, never on the strip) · 'gone' (removed). A row with `exists` is drawn only while its thing does — always
// in its own place when it is.

/** The doors other marks fold into (each is itself a row of the strip). */
export const DOORS = Object.freeze({
  model: 'model',          // the model + the thinking level: ONE door, both readable on its face
  context: 'ctx',          // the context ring + % — the details live in its panel
  artifacts: 'artifacts',  // 产出: files, designs and published pages, by kind inside its panel
  background: 'tasks',     // «后台»: background tasks and workflows, one door; a failure said on its face
  settings: 'settings',    // «⚙ 对话设置»: the low-frequency things, each row showing its present value
});

/** Homes OFF the strip (never a strip mark under another name). */
export const HOMES = Object.freeze({
  titleBar: 'title-bar',          // the chat window's title bar (search)
  sessionProps: 'session-props',  // Session Properties (a tool that failed at the start, in words)
  diagnostics: 'diagnostics',     // ⚙ Diagnostics (that tool too; the CLI's new record kinds)
});

const row = (key, cls, place, order, extra = {}) => Object.freeze({ key, cls, place, order, exists: false, short: null, title: null, ...extra });

/** THE TABLE — one row per mark the bar can draw (keys = the bar's chip keys, chat-status-bar.js render()). */
export const STRIP_ROWS = Object.freeze([
  // ── row 1: I, always seen — first, while they exist, what stops the chat or asks for the person ──
  row('turnstate', 'I', 'row1', 10, { exists: true }),                       // «waiting for you» — jumps to the ask
  row('remote', 'I', 'row1', 20, { exists: true }),                          // a lost link / a locked vault (no protection: a settings row)
  row('autoresume', 'I', 'row1', 30, { exists: true, alsoIn: DOORS.settings }), // ARMED with its time on row 1; its switch is a settings row
  row('fallback', 'I', 'row1', 35, { exists: true }),                       // (B-d578 r3918) on a pool's fallback (billed there) or waiting for one — its words and, when it can act, ONE button beside them
  row('model', 'I', 'row1', 40, { door: DOORS.model }),                      // the model + the thinking level, one door
  row('perm', 'I', 'row1', 50),                                              // the permission mode in words (the settled fork: row 1)
  row('ctx', 'I', 'row1', 60, { door: DOORS.context, short: 'percent' }),    // ring + % (the window unknown: «?» in the same slot)
  row('ctx-unknown', 'I', 'row1', 60, { door: DOORS.context, short: 'percent', sameSlotAs: 'ctx' }),
  // ── row 2: II, always findable, then III's one door ──
  row('artifacts', 'II', 'row2', 10, { door: DOORS.artifacts }),             // 产出 — always, even at zero; designs and pages folded in
  row('outbox', 'II', 'row2', 20),                                           // 发件箱 — «n 在等» on its face when some wait; «· 0» at zero (a subagent's viewer has none: it drafts under its parent)
  row('browser', 'II', 'row2', 30, { exists: true, title: { maxCh: 18 } }),  // the agent browser — its profile name cut inside the chip
  row('channels', 'II', 'row2', 40, { exists: true, title: { maxCh: 18 } }), // the channel this turn touched — its title cut inside the chip
  row('tasks', 'II', 'row2', 50, { exists: true, door: DOORS.background, short: 'count' }), // «后台» — tasks + workflows
  row('settings', 'III', 'row2', 90, { door: DOORS.settings, short: 'short' }), // «⚙ 对话设置» — last
  // ── inside a door (drawn in its panel, never on the strip) ──
  row('effort', 'I', 'in:model', 41),
  row('design', 'II', 'in:artifacts', 11),
  row('wf', 'II', 'in:tasks', 51),
  row('style', 'III', 'in:settings', 1),
  row('goal', 'III', 'in:settings', 3),
  row('review', 'III', 'in:settings', 4),
  row('held', 'III', 'in:settings', 5),
  row('billing', 'III', 'in:settings', 6),                                   // the phone's account (who pays)
  row('cache', 'IV', 'in:ctx', 61),
  row('cache-k', 'IV', 'in:ctx', 62),
  row('odometer', 'IV', 'in:ctx', 63),
  row('turn-time', 'IV', 'in:ctx', 64),
  row('unreported', 'IV', 'in:ctx', 65),
  row('cost', 'IV', 'in:ctx', 66, { onDoorWhen: 'billedPerUse' }),           // on the context door's face only when billed per use
  // ── homes off the strip, and what leaves ──
  row('search', 'II', 'home:title-bar', 0),
  row('health', 'IV', 'home:session-props', 0, { alsoHome: HOMES.diagnostics }),
  row('kinds', 'IV', 'home:diagnostics', 0),
  row('more', 'IV', 'gone', 0),                                              // «⋯ show more» — nothing hides behind it any more
]);

/** What the page REMOVES outright (page.md §4 «Removes from the strip»: the ⋯ fold) — every other mark that leaves the
 *  strip is MOVED, never lost: it names its home (a door on the strip, or a home off it). */
export const PAGE_REMOVES = Object.freeze(['more']);

/** The row of a mark key, or null (a mark with no row is a census red). */
export const ROW_OF = Object.freeze(Object.fromEntries(STRIP_ROWS.map((r) => [r.key, r])));
export const rowOf = (key) => ROW_OF[key] || null;
/** Drawn ON the strip (row 1 or row 2)? */
export const onStrip = (key) => { const r = ROW_OF[key]; return !!r && (r.place === 'row1' || r.place === 'row2'); };
/** The marks a door's panel holds, in their order. */
export const insideOf = (door) => STRIP_ROWS.filter((r) => r.place === `in:${door}`).sort((a, b) => a.order - b.order).map((r) => r.key);

/** THE WIDTHS (the owner, 2026-11-14): ONE row at ONE_ROW_PX and above; the SAME two rows below it, down to the window's
 *  floor; the short forms at SHORT_FORM_PX and below. Nothing behind «show more» at any width. */
export const ONE_ROW_PX = 960;
export const SHORT_FORM_PX = 360;

/**
 * THE ARRANGEMENT: which marks are on the strip, in which row and order, in which form — from what exists now.
 * @param {object} present  key → truthy when that mark's thing exists now (an `exists` row is drawn only then; a row
 *                          without `exists` is always drawn). `ctxUnknown` picks the context's «?» slot.
 * @param {number} width    the chat window's width in px
 * @returns {{ rows: string[][], oneRow: boolean, form: 'full'|'short' }}
 */
export function arrange(present = {}, width = ONE_ROW_PX) {
  const has = (r) => !r.exists || !!present[r.key];
  const ctxKey = present.ctxUnknown ? 'ctx-unknown' : 'ctx';
  const shown = STRIP_ROWS.filter((r) => (r.place === 'row1' || r.place === 'row2') && has(r) && (!r.sameSlotAs || r.key === ctxKey) && !(r.key === 'ctx' && ctxKey !== 'ctx'));
  const byOrder = (a, b) => a.order - b.order;
  const r1 = shown.filter((r) => r.place === 'row1').sort(byOrder).map((r) => r.key);
  const r2 = shown.filter((r) => r.place === 'row2').sort(byOrder).map((r) => r.key);
  const oneRow = Number(width) >= ONE_ROW_PX;
  return { rows: oneRow ? [[...r1, ...r2]] : [r1, r2], oneRow, form: Number(width) <= SHORT_FORM_PX ? 'short' : 'full' };
}

/**
 * THE CENSUS of a bar's source: every mark it draws (`chip('<key>'`) — `unknown` = no row in this table (RED),
 * `offStrip` = a row that does not live on the strip but is still drawn there (RED once the bar draws from the table).
 * PURE over the source text; scripts/test-strip-table.mjs runs it on src/lib/chat-status-bar.js and on a planted copy.
 */
export function censusOfBar(src) {
  const keysOf = (re) => [...new Set([...String(src).matchAll(re)].map((m) => m[1]))];
  const plain = keysOf(/(?<![\w.$])chip\(\s*'([a-z0-9-]+)'/g);                // chip('x', …): drawn ON the strip
  const either = keysOf(/\?\s*chip\s*:\s*inDoor\)\(\s*'([a-z0-9-]+)'/g);    // (cond ? chip : inDoor)('x', …): on the strip while cond, else a row
  const doors = keysOf(/(?<![\w.$])inDoor\(\s*'([a-z0-9-]+)'/g);              // inDoor('x', …): a row of a door's panel
  const drawn = [...new Set([...plain, ...either])];
  return {
    drawn, doors: [...new Set([...doors, ...either])],
    unknown: [...new Set([...drawn, ...doors])].filter((k) => !ROW_OF[k]),
    // a plain chip off its place is RED even beside a door row of the same name (the cure of 644a67ec2: the census hole)
    offStrip: drawn.filter((k) => ROW_OF[k] && !onStrip(k)),
    doorWrong: [...new Set([...doors, ...either])].filter((k) => ROW_OF[k] && !ROW_OF[k].place.startsWith('in:') && !(ROW_OF[k].alsoIn && ROW_OF[k].alsoIn === 'settings')),
  };
}

/**
 * MOVED, NOT LOST (主开发 2026-11-17 22:01Z): every row off the strip names its home — `in:<door>` with that door itself
 * on the strip, or `home:<one of HOMES>` — and only what the page removes is `gone`. → the rows that break it, by key.
 */
export function homesCensus(rows = STRIP_ROWS, removes = PAGE_REMOVES) {
  const keys = new Set(rows.map((r) => r.key)), strip = new Set(rows.filter((r) => r.place === 'row1' || r.place === 'row2').map((r) => r.key));
  const homes = new Set(Object.values(HOMES)), bad = [];
  for (const r of rows) {
    if (r.place === 'row1' || r.place === 'row2') continue;
    if (r.place === 'gone') { if (!removes.includes(r.key)) bad.push(`${r.key}: gone, but the page does not remove it`); continue; }
    if (r.place.startsWith('in:')) { const d = r.place.slice(3); if (!keys.has(d) || !strip.has(d)) bad.push(`${r.key}: inside «${d}», which is no door on the strip`); continue; }
    if (r.place.startsWith('home:')) { if (!homes.has(r.place.slice(5))) bad.push(`${r.key}: home «${r.place.slice(5)}» is not one of the named homes`); continue; }
    bad.push(`${r.key}: no place`);
  }
  return bad;
}
