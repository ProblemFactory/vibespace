#!/usr/bin/env node
// THE STRIP'S ONE TABLE (gate row `test-strip-table`; lane mask-value-shape, the chat status strip step two — spec
// /var/tmp/vibespace-lanes/chat-status-strip/page.md §1 / §4, the owner's acceptance of 2026-11-14).
//   ① the table: one row per mark, a valid class and place; row 1 holds class I only; row 2 holds II, then III's one door
//   ② the arrangement with EVERY mark present at once: ONE row at 960 and above; the SAME two rows from 280 to 959; short
//      forms at 360 and below; nothing behind «show more» at any width
//   ③ a thing is always in the same place: its order does not move when its neighbours come and go
//   ④ THE CENSUS of src/lib/chat-status-bar.js: every mark it draws has a row (none unknown); the marks still drawn on the
//      strip that the table places elsewhere are the named debt the bar's rewrite (P2) brings to zero
//   ④a MOVED, NOT LOST: every mark off the strip names its home; only what the page removes is gone (red controls)
//   ⑤ RED CONTROLS: a planted mark the table does not know is red by name; a detail put back on the strip is red by name
// PURE + source text only — no DOM, no clock.
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const T = await import(path.join(REPO, 'src/lib/strip-table.js'));
const { STRIP_ROWS, ROW_OF, DOORS, HOMES, PAGE_REMOVES, arrange, censusOfBar, homesCensus, onStrip, insideOf, ONE_ROW_PX, SHORT_FORM_PX } = T;

console.log('① the table');
{
  const keys = STRIP_ROWS.map((r) => r.key);
  ok(new Set(keys).size === keys.length, `one row per mark (${keys.length} marks, no key twice)`);
  const PLACE = /^(row1|row2|in:[a-z-]+|home:[a-z-]+|gone)$/;
  const bad = STRIP_ROWS.filter((r) => !['I', 'II', 'III', 'IV'].includes(r.cls) || !PLACE.test(r.place));
  ok(!bad.length, 'every row has a class I–IV and a place (row1 · row2 · in:<door> · home:<where> · gone)', bad.map((r) => r.key).join(', '));
  const r1 = STRIP_ROWS.filter((r) => r.place === 'row1');
  ok(r1.length > 0 && r1.every((r) => r.cls === 'I'), `row 1 holds class I only (${r1.map((r) => r.key).join(', ')})`);
  const r2 = STRIP_ROWS.filter((r) => r.place === 'row2').sort((a, b) => a.order - b.order);
  const firstIII = r2.findIndex((r) => r.cls === 'III');
  ok(r2.every((r) => r.cls === 'II' || r.cls === 'III') && firstIII === r2.length - 1 && r2[firstIII].key === 'settings', `row 2 holds II, then ONE III door last (${r2.map((r) => `${r.key}:${r.cls}`).join(', ')})`);
  const doors = new Set(STRIP_ROWS.filter((r) => r.place.startsWith('in:')).map((r) => r.place.slice(3)));
  ok([...doors].every((d) => onStrip(d)), `every door a mark folds into is itself on the strip (${[...doors].join(', ')})`);
  ok(STRIP_ROWS.filter((r) => r.cls === 'IV').every((r) => !onStrip(r.key)), 'no class IV detail lives on the strip');
  ok(insideOf(DOORS.settings).join() === 'style,goal,review,held,billing', `«对话设置» holds the low-frequency things in a fixed order (${insideOf(DOORS.settings).join(', ')})`);
  ok(insideOf(DOORS.context).join() === 'cache,cache-k,odometer,turn-time,unreported,cost', `the context door holds the details (${insideOf(DOORS.context).join(', ')})`);
  ok(insideOf(DOORS.model).join() === 'effort' && insideOf(DOORS.artifacts).join() === 'design' && insideOf(DOORS.background).join() === 'wf', 'the merges: thinking into the model door, designs into 产出, workflows into «后台»');
  ok(ROW_OF.browser.title && ROW_OF.browser.title.maxCh > 0 && ROW_OF.channels.title && ROW_OF.channels.title.maxCh > 0, 'a LONG TITLE never takes a row: the browser and the channel carry a bounded title (cut inside their own chip)');
}

console.log('② the arrangement, every mark present at once');
{
  const ALL = Object.fromEntries(STRIP_ROWS.filter((r) => r.exists).map((r) => [r.key, true]));
  const at = (w) => arrange(ALL, w);
  const one = at(960);
  ok(one.oneRow && one.rows.length === 1, `ONE row at ${ONE_ROW_PX} (${one.rows[0].join(' · ')})`);
  ok(at(1200).rows.length === 1 && at(1440).rows.length === 1, 'one row at 1200 and 1440');
  const two = at(500);
  ok(two.rows.length === 2 && two.rows[0].join() === 'turnstate,remote,autoresume,model,perm,ctx' && two.rows[1].join() === 'artifacts,outbox,browser,channels,tasks,settings',
    `TWO rows at 500 — row 1 «${two.rows[0].join(' · ')}», row 2 «${two.rows[1].join(' · ')}»`);
  const ladder = [280, 320, 360, 420, 500, 720];
  ok(ladder.every((w) => JSON.stringify(at(w).rows) === JSON.stringify(two.rows)), `the SAME two rows at ${ladder.join(' / ')} (a thing never changes row with the width)`);
  ok(at(360).form === 'short' && at(SHORT_FORM_PX).form === 'short' && at(420).form === 'full' && at(500).form === 'full', 'the short forms at 360 and below, the full ones above');
  ok(one.rows[0].join() === [...two.rows[0], ...two.rows[1]].join(), 'the one row at 960 is row 1 then row 2, in the same order');
  ok(!STRIP_ROWS.some((r) => r.key === 'more' && onStrip('more')), 'nothing behind «show more»: the ⋯ mark is gone at every width');
}

console.log('③ a thing is always in the same place');
{
  const bare = arrange({}, 500);
  ok(bare.rows[0].join() === 'model,perm,ctx' && bare.rows[1].join() === 'artifacts,outbox,settings', `with nothing transient: row 1 «${bare.rows[0].join(' · ')}», row 2 «${bare.rows[1].join(' · ')}» (产出 even at zero)`);
  const someWait = arrange({ turnstate: true, channels: true }, 500);
  ok(someWait.rows[0][0] === 'turnstate' && someWait.rows[1].join() === 'artifacts,outbox,channels,settings', 'a waiting ask comes FIRST on row 1; a channel sits in its own place on row 2 with the browser absent');
  const unk = arrange({ ctxUnknown: true }, 500);
  ok(unk.rows[0].join() === 'model,perm,ctx-unknown', 'the context with an unknown window takes the context\'s own slot');
}

console.log('④a moved, not lost');
{
  const bad = homesCensus();
  ok(!bad.length, `every mark off the strip names its home (a door on the strip, or ${Object.values(HOMES).join(' / ')}); only what the page removes is gone (${PAGE_REMOVES.join(', ')})`, bad.join(' | '));
  const lost = STRIP_ROWS.map((r) => (r.key === 'health' ? { ...r, place: 'gone' } : r));
  const homeless = STRIP_ROWS.map((r) => (r.key === 'kinds' ? { ...r, place: 'home:nowhere' } : r));
  const orphan = STRIP_ROWS.map((r) => (r.key === 'style' ? { ...r, place: 'in:nodoor' } : r));
  const c1 = homesCensus(lost), c2 = homesCensus(homeless), c3 = homesCensus(orphan);
  ok(c1.some((x) => x.startsWith('health:')) && c2.some((x) => x.startsWith('kinds:')) && c3.some((x) => x.startsWith('style:')),
    'RED CONTROLS: a mark dropped as gone that the page does not remove, a home that is not named, a door that is not on the strip — each red by name', [c1, c2, c3].map((c) => c.join(' ; ')).join(' | '));
}

const BAR = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
console.log('④ the census of the bar');
{
  const c = censusOfBar(BAR);
  ok(c.drawn.length >= 12 && c.doors.length >= 5, `the census sees the bar's marks (${c.drawn.length} on the strip or still to move, ${c.doors.length} drawn inside a door)`);
  ok(c.doorWrong.length === 0, `every mark the bar draws INSIDE a door is a door row of the table${c.doorWrong.length ? ' — WRONG: ' + c.doorWrong.join(', ') : ''}`);
  ok(c.unknown.length === 0, `every mark the bar draws has a row in the table${c.unknown.length ? ' — UNKNOWN: ' + c.unknown.join(', ') : ''}`);
  // THE DEBT the bar's rewrite brought to zero (P2: the doors; P3: the homes — search, health, kinds): no mark the table places
  // elsewhere is drawn on the strip
  ok(c.offStrip.length === 0, `no mark the table places elsewhere is drawn on the strip — the debt is ZERO`, `now: ${c.offStrip.join(', ')}`);
  // MOVED, NOT LOST — each home READS the mark it took: Session Properties the health rows and the record kinds (from the bar's
  // own accessors), the phone's top bar the search
  const PROPS = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8');
  ok(/bar\?\.initHealthRows\?\.\(\)/.test(PROPS) && /bar\?\.addedKindsWords\?\.\(\)/.test(PROPS) && /initHealthRows\(\) \{/.test(BAR) && /addedKindsWords\(\) \{/.test(BAR) && /window\.addEventListener\('vs-start-facts'/.test(PROPS),
    'moved, not lost: Session Properties reads the start facts (a tool that did not start, the record kinds) from the bar, and re-reads them when they change');
  const NAV = fs.readFileSync(path.join(REPO, 'src/lib/mobile-nav.js'), 'utf8'), HTML = fs.readFileSync(path.join(REPO, 'public/index.html'), 'utf8');
  ok(/<button id="mobile-nav-search" [^>]*title="Search this conversation"/.test(HTML) && /this\._shownChat\(\)\?\._search\?\.open\?\.\(\)/.test(NAV) && !/chip\('search'/.test(BAR),
    'moved, not lost: the search is the phone\'s top-bar magnifier (where the conversation\'s name lives), opening the shown conversation\'s search — no strip mark');
}

console.log('⑤ red controls');
{
  const planted = BAR.replace("chip('model',", "chip('planted', 'chat-status-planted', '', 'x');\n      chip('model',");
  const p = censusOfBar(planted);
  ok(planted !== BAR && p.unknown.includes('planted'), 'RED CONTROL: a planted mark the table does not know is named (unknown)');
  const back = censusOfBar("chip('model', 'm', '', 'x'); chip('cache', 'c', '', 'x');");
  const wrongDoor = censusOfBar("inDoor('model', 'm', '', 'x');");
  ok(wrongDoor.doorWrong.includes('model'), 'RED CONTROL: a strip mark put inside a door is named (doorWrong)');
  ok(back.offStrip.includes('cache') && !back.offStrip.includes('model'), 'RED CONTROL: a detail put back on the strip is named (off the strip by its row)');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
