#!/usr/bin/env node
// test-api-call-words — THE WORDS of a raw-API proposal's title (lanes api-call-card-words, api-call-words-from-spec;
// PURE src/api-call-words.js; docs/kb-patterns.md «Card grammar» ① ②): hand row (the body's count) → the GENERATED
// long tail (the vendors' own catalogues) → "call the <vendor> API (<METHOD> <last segment>)".
//   ① the census: every hand row has a fixture here and every fixture names a row (no orphan, no silent row)
//   ② per hand row: the fixture hits exactly its row with its words + object — and a RED CONTROL: without that row
//      and without the generated table it is the unknown fallback (vendor + method + last segment, never the raw path)
//   ③ the fallback's last segment skips ids; an unknown host names the account; the object view (the store's name /
//      8-char id — never the agent's note) and the card model's title read the words
//   ④ the generated table: in sync with scripts/gen-api-call-words.mjs over the SHA-pinned scripts/api-specs/; the
//      coverage PRINTED; 12 sample titles across vendors; the missing words PINNED; RED = the table emptied ⇒ generic;
//      no network anywhere on this path
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = require(path.join(ROOT, 'src/api-call-words.js'));
const C = require(path.join(ROOT, 'src/channel-api-card.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', JSON.stringify(info).slice(0, 600)); } };

const DOC = 'DocFixtureAAAAAAAAAA1', BLK = 'BlkFixtureBBBBBBBBBB2', APP = 'AppFixtureCCCCCCCCCC3', TBL = 'tblFixture4';
const lark = (method, p, body, query = []) => ({ host: 'open.feishu.cn', method, path: p, body: body == null ? null : JSON.stringify(body), query, credLabel: 'Lark · ops' });
const slack = (m, body) => ({ host: 'slack.com', method: 'POST', path: `/api/${m}`, body: JSON.stringify(body), query: [], credLabel: 'Slack · team' });
const gmail = (p) => ({ host: 'gmail.googleapis.com', method: 'POST', path: p, body: '{"raw":"fixture"}', query: [], credLabel: 'Gmail · me' });
/** row id → [the proposal fixture, the expected key, the expected params, the expected object (kind / id / name)] */
const FIXTURES = {
  'lark-docx-blocks-delete': [lark('DELETE', `/open-apis/docx/v1/documents/${DOC}/blocks/${BLK}/children/batch_delete`, { start_index: 0, end_index: 3 }), 'delete {n} blocks ({start}–{end}) from the document “{object}”', { n: 3, start: 1, end: 3 }, { kind: 'doc', id: DOC }],
  'lark-docx-blocks-create': [lark('POST', `/open-apis/docx/v1/documents/${DOC}/blocks/${BLK}/children`, { children: [{}, {}], index: 0 }), 'insert {n} blocks into the document “{object}”', { n: 2 }, { kind: 'doc', id: DOC }],
  'lark-docx-blocks-update': [lark('PATCH', `/open-apis/docx/v1/documents/${DOC}/blocks/batch_update`, { requests: [{}, {}, {}] }), 'change {n} blocks in the document “{object}”', { n: 3 }, { kind: 'doc', id: DOC }],
  'lark-docx-create': [lark('POST', '/open-apis/docx/v1/documents', { title: 'Weekly notes' }), 'create the document “{object}”', {}, { kind: 'doc', name: 'Weekly notes' }],
  'lark-im-send': [lark('POST', '/open-apis/im/v1/messages', { receive_id: 'oc_fixture', msg_type: 'text' }, [['receive_id_type', 'chat_id']]), 'send a message in {object}', {}, { kind: 'chat', id: 'oc_fixture' }],
  'lark-drive-upload': [{ ...lark('POST', '/open-apis/drive/v1/files/upload_all', null), body: '--b\r\nContent-Disposition: form-data; name="parent_node"\r\n\r\nfldFixture5\r\n--b--' }, 'upload a file to the folder “{object}”', {}, { kind: 'folder', id: 'fldFixture5' }],
  'lark-bitable-records': [lark('POST', `/open-apis/bitable/v1/apps/${APP}/tables/${TBL}/records/batch_update`, { records: [{}, {}] }), 'change {n} rows in the table “{object}”', { n: 2 }, { kind: 'table', id: APP }],
  'slack-conversations-create': [slack('conversations.create', { name: 'launch' }), 'create the channel {object}', {}, { kind: 'chat', name: '#launch' }],
  'slack-conversations-invite': [slack('conversations.invite', { channel: 'C0FIXTURE1', users: 'U0A,U0B' }), 'invite {n} people to {object}', { n: 2 }, { kind: 'chat', id: 'C0FIXTURE1' }],
  'slack-conversations-rename': [slack('conversations.rename', { channel: 'C0FIXTURE1', name: 'launch-2' }), 'rename {object} to {name}', { name: 'launch-2' }, { kind: 'chat', id: 'C0FIXTURE1' }],
};
const FALLBACK = 'call the {vendor} API ({call})';
const EMPTY = Object.freeze({ ROWS: [], PHRASES: [] });
const sameObj = (a, b) => (a === null && b === null) || (!!a && !!b && a.kind === b.kind && (a.id || null) === (b.id || null) && (a.name || null) === (b.name || null));

console.log('① the census (rows ↔ fixtures)');
const ids = W.ROWS.map((r) => r.id);
ok(new Set(ids).size === ids.length, `every row id is unique (${ids.length} rows)`, ids);
ok(ids.every((id) => FIXTURES[id]), 'every table row has a fixture here', ids.filter((id) => !FIXTURES[id]));
ok(Object.keys(FIXTURES).every((id) => ids.includes(id)), 'every fixture names a live row', Object.keys(FIXTURES).filter((id) => !ids.includes(id)));

console.log('② per row: its words — and RED without the row');
for (const [id, [p, key, params, obj]] of Object.entries(FIXTURES)) {
  const w = W.wordsOf(p);
  ok(w.row === id && w.key === key && JSON.stringify(w.params) === JSON.stringify(params) && sameObj(w.object, obj), `${id}: ${p.method} ${p.path.split('/').slice(-2).join('/')} ⇒ "${key}"`, w);
  const red = W.wordsOf(p, { rows: W.ROWS.filter((r) => r.id !== id), generated: EMPTY });
  ok(red.row === null && red.key === FALLBACK && !red.params.call.includes('/') && red.params.call.startsWith(`${p.method} `), `CONTROL ${id}: without its row (and the generated table) the title is the fallback (${red.params.call}), never the raw path`, red);
  const gen = W.wordsOf(p, { rows: W.ROWS.filter((r) => r.id !== id) });
  ok(gen.row !== id && gen.key !== key, `${id}: the hand row is what reads the body (without it: ${gen.row || 'generic'})`, gen);
}

console.log('③ the fallback, the object, the model');
const u = W.wordsOf(lark('POST', '/open-apis/contact/v3/users/ou_fixture1234567890abcdef/x1', { a: 1 }));
ok(u.row === null && u.key === FALLBACK && u.params.vendor === 'Lark' && u.params.call === 'POST users', 'an unknown Lark call: vendor + method + the last MEANINGFUL segment (ids skipped)', u);
const g = W.wordsOf({ host: 'sheets.googleapis.com', method: 'PUT', path: '/v4/spreadsheets/1AbCdEfGhIjKlMnOpQrStUv/values/A1:B2', query: [] });
ok(g.params.vendor === 'Google' && g.params.call === 'PUT values', 'any *.googleapis.com is Google; a range-like last segment is skipped too', g);
const x = W.wordsOf({ host: 'api.example.test', method: 'POST', path: '/v1/things', credLabel: 'Example · acct', query: [] });
ok(x.params.vendor === 'Example · acct' && x.params.call === 'POST things', 'an unknown host names the account it runs on', x);
ok(W.lastSegment('/a/b/123/') === 'b' && W.lastSegment('/1234') === '/' && W.lastSegment('/api/chat.postMessage') === 'chat.postMessage', 'lastSegment: ids skipped, method names kept, nothing left ⇒ "/"');
const ov = W.objectView({ kind: 'doc', id: DOC }, {});
ok(ov.name === null && ov.short === `${DOC.slice(0, 8)}…` && ov.conv === null, 'an unnamed object is its id shortened to 8 chars', ov);
ok(W.objectView({ kind: 'chat', id: 'C1' }, { name: 'x'.repeat(80), conv: { adapterId: 'a', convId: 'C1' } }).name.length === W.OBJECT_NAME_MAX, 'an object name is capped (titles stay short)');
const base = { id: 'api-x', status: 'pending', principal: { name: 'Odd jobs' }, at: 0, ...FIXTURES['lark-docx-blocks-delete'][0] };
const m = C.cardModel(base);
ok(m.head.key === '{name} wants to {what}' && m.head.params.name === 'Odd jobs' && m.head.what.key === FIXTURES['lark-docx-blocks-delete'][1] && m.head.row === 'lark-docx-blocks-delete', 'the card model\'s title = actor + the table\'s words', m.head);
const quoted = C.cardModel({ ...base, note: 'drop 《Plan》 dupes' });
ok(C.cardModel({ ...base, objectName: 'Weekly notes' }).head.object.name === 'Weekly notes' && quoted.head.object.name === null && quoted.head.object.short === `${DOC.slice(0, 8)}…` && quoted.note === 'drop 《Plan》 dupes',
  'the object is named by the record (the store) else its id chip — the agent\'s note stays a quote, never the title', quoted.head);

console.log('④ the generated long tail (src/api-call-words.generated.js ← scripts/api-specs/)');
const G = W.GENERATED;
const GEN = await import(path.join(ROOT, 'scripts/gen-api-call-words.mjs'));
const fs = require('fs');
ok(GEN.build() === fs.readFileSync(path.join(ROOT, 'src/api-call-words.generated.js'), 'utf8'), 'the committed table is exactly what the generator makes from the SHA-pinned vendored catalogues (no hand edits)');
const sums = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'scripts/api-specs/SHA256SUMS'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/).reverse()));
ok(JSON.stringify(G.SOURCES) === JSON.stringify(sums) && Object.keys(sums).length === 8, `the table names its 8 sources by sha256 (${Object.keys(sums).join(', ')})`, G.SOURCES);
const byV = (v) => G.ROWS.filter((r) => r[1] === v);
const larkIds = byV('lark').map((r) => r[0].split('.'));
const COVER = { slack: byV('slack').length, gmail: byV('google').length, lark: byV('lark').length, larkResources: new Set(larkIds.map((x) => x[2])).size, larkVerbs: new Set(larkIds.map((x) => x[3])).size };
console.log(`    coverage: Slack ${COVER.slack} methods · Gmail ${COVER.gmail} methods · Lark ${COVER.lark} methods = ${COVER.larkResources} resources × ${COVER.larkVerbs} verbs (${Object.keys(G.SOURCES).filter((f) => f.startsWith('lark-go/')).map((f) => f.slice(8, -7)).join(', ')}) · ${G.PHRASES.length} phrases · ${G.ROWS.filter((r) => r[7]).length} rows the verb calls sensitive`);
ok(COVER.slack === 170 && COVER.gmail === 79 && COVER.lark === 164, 'coverage pinned: Slack 170 · Gmail 79 · Lark 164 (a refresh that moves it moves this line)', COVER);
ok(G.PHRASES.every((ph) => ph.length === 3 && ph.every((s) => typeof s === 'string' && s.trim())) && G.ROWS.every((r) => G.PHRASES[r[4]] && /^\//.test(r[3])), 'every row has a phrase in en / zh / ja and a path pattern');
ok(G.ROWS.filter((r) => /\.(Batch)?Delete$|\.delete$|\.batchDelete$/.test(r[0])).every((r) => r[7] === 1), 'every delete / batch-delete row is flagged sensitive by its verb (the runtime verdict stays the engine\'s)');
console.log(`    missing words (${G.MISSING.length}, read as their English split): ${G.MISSING.join(' · ')}`);
ok(G.MISSING.length === 15, 'the missing-word list is PINNED at 15 — a new resource without a word shows up here', G.MISSING);
const DEL = lark('DELETE', `/open-apis/docx/v1/documents/${DOC}/blocks/${BLK}/children/batch_delete`, {});
const SAMPLES = [
  [DEL, '批量删除 文档块的子块（{object}）', { kind: 'doc', id: DOC }],
  [lark('DELETE', '/open-apis/im/v1/messages/om_fixture2', null), '删除 消息（{object}）', { kind: 'message', id: 'om_fixture2' }],
  [lark('PUT', '/open-apis/im/v1/chats/oc_fixture', { name: 'x' }), '修改 群（{object}）', { kind: 'chat', id: 'oc_fixture' }],
  [lark('POST', `/open-apis/bitable/v1/apps/${APP}/tables/${TBL}/records/batch_delete`, {}), '批量删除 多维表格记录（{object}）', { kind: 'table', id: APP }],
  [lark('POST', '/open-apis/im/v1/messages/om_fixture1/reply', { msg_type: 'text' }), '回复 消息（{object}）', { kind: 'message', id: 'om_fixture1' }],
  [slack('chat.postMessage', { channel: 'C0FIXTURE1', text: 'hi' }), '发送 消息（{object}）', { kind: 'chat', id: 'C0FIXTURE1' }],
  [slack('conversations.archive', { channel: 'C0FIXTURE1' }), '归档 频道（{object}）', { kind: 'chat', id: 'C0FIXTURE1' }],
  [slack('conversations.setTopic', { channel: 'C0FIXTURE1', topic: 'x' }), '设置 话题（{object}）', { kind: 'chat', id: 'C0FIXTURE1' }],
  [{ ...slack('conversations.history', {}), method: 'GET', body: null, query: [['channel', 'C0FIXTURE1']] }, '读取 历史（{object}）', { kind: 'chat', id: 'C0FIXTURE1' }],
  [gmail('/gmail/v1/users/me/messages/send'), '发送 邮件', null],
  [gmail('/upload/gmail/v1/users/me/drafts'), '新建 草稿', null],
  [{ ...gmail('/gmail/v1/users/me/labels/Label_7'), method: 'DELETE', body: null }, '删除 标签（{object}）', { kind: 'label', id: 'Label_7' }],
];
for (const [p, zh, obj] of SAMPLES) {
  const w = W.wordsOf(p);
  ok(/^gen:/.test(w.row) && w.text.zh === zh && w.text.en && w.text.ja && sameObj(w.object, obj), `${p.method} ${p.path.replace(/^\/open-apis|^\/gmail\/v1\/users\/me/, '…')} ⇒ 「${zh}」 (${w.row})`, w);
  const red = W.wordsOf(p, { generated: EMPTY });
  ok(red.row === null && red.key === FALLBACK && !red.text, `CONTROL: the generated table emptied ⇒ only the generic form (${red.params.call})`, red);
}
const d = W.wordsOf(DEL);
ok(d.text.en === 'batch-delete document block children “{object}”' && d.text.ja === 'ドキュメントブロックの子ブロックを一括削除（{object}）' && d.sensitive === true, 'the batch_delete reads in en / ja too, and its verb says sensitive', d.text);
const bare = W.wordsOf(slack('chat.postMessage', { text: 'hi' }));
ok(bare.text.zh === '发送 消息' && bare.object === null, 'no object in the request ⇒ the phrase without its 「（…）」', bare);
const cm = C.cardModel({ id: 'api-g', status: 'pending', principal: { name: 'Odd jobs' }, at: 0, ...DEL });
ok(cm.head.what.text && cm.head.what.text.zh === SAMPLES[0][1] && cm.head.object.short === `${DOC.slice(0, 8)}…`, 'the card model carries the generated phrase + the doc chip', cm.head);
const NET = /require\((['"])(https?|net|tls|undici)\1\)|\bfetch\(|XMLHttpRequest/;
ok(['src/api-call-words.js', 'src/api-call-words.generated.js', 'scripts/gen-api-call-words.mjs'].every((f) => !NET.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))), 'no network on this path: the words module, the table and the generator read files only');

console.log(fail ? `FAILED: ${fail} of ${pass + fail}` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
