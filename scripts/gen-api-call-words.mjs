#!/usr/bin/env node
// gen-api-call-words — THE LONG TAIL of a raw-API card's words, GENERATED at build time from the vendors' own
// catalogues (lane api-call-words-from-spec; docs/kb-patterns.md «Card grammar»): Slack's Web API OpenAPI, Gmail's
// discovery document, the Lark Go SDK method tables — all vendored under scripts/api-specs/ (SHA256SUMS pins them;
// scripts/api-specs/fetch.sh is the OWNER's refresh, never run in CI). No network here, ever.
//
// A phrase = 「{verb} {resource}」 from two SMALL hand dictionaries below (the only hand-written part): VERBS (the
// call's first word) and RESOURCES (the thing it acts on — a Lark Go type, a Slack method family, a Gmail resource).
// A resource with no word falls back to its English split and is listed in MISSING (test-api-call-words pins the
// count, so growth is seen). Out: src/api-call-words.generated.js (committed; the tree needs no network).
//   node scripts/gen-api-call-words.mjs          write the table
//   node scripts/gen-api-call-words.mjs --check  exit 1 when the committed table is not what the sources make
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = path.join(ROOT, 'scripts/api-specs');
const OUT = path.join(ROOT, 'src/api-call-words.generated.js');

// VERBS: key (lower-case words) → [en, zh, ja]; SENSITIVE: the verbs that say so (the runtime verdict stays the engine's).
export const VERBS = {
  create: ['create', '新建', '作成'], 'batch create': ['batch-create', '批量新建', '一括作成'], add: ['add', '添加', '追加'], insert: ['insert', '插入', '挿入'],
  delete: ['delete', '删除', '削除'], 'batch delete': ['batch-delete', '批量删除', '一括削除'], remove: ['remove', '移除', '除外'],
  patch: ['change', '修改', '変更'], update: ['change', '修改', '変更'], modify: ['change', '修改', '変更'], 'batch update': ['batch-change', '批量修改', '一括変更'],
  'batch modify': ['batch-change', '批量修改', '一括変更'], set: ['set', '设置', '設定'], put: ['set', '设置', '設定'],
  list: ['list', '列出', '一覧表示'], simplelist: ['list', '列出', '一覧表示'], get: ['read', '读取', '取得'], 'batch get': ['batch-read', '批量读取', '一括取得'], read: ['read', '读取', '取得'],
  search: ['search', '搜索', '検索'], lookup: ['look up', '查找', '検索'], send: ['send', '发送', '送信'], post: ['send', '发送', '送信'], reply: ['reply to', '回复', '返信'],
  schedule: ['schedule', '定时发送', '予約送信'], upload: ['upload', '上传', 'アップロード'], download: ['download', '下载', 'ダウンロード'], move: ['move', '移动', '移動'],
  copy: ['copy', '复制', 'コピー'], subscribe: ['subscribe to', '订阅', '購読'], subscription: ['subscribe to', '订阅', '購読'], unsubscribe: ['unsubscribe from', '取消订阅', '購読解除'],
  forward: ['forward', '转发', '転送'], recall: ['recall', '撤回', '取り消し'], withdraw: ['withdraw', '撤回', '取り下げ'], archive: ['archive', '归档', 'アーカイブ'],
  unarchive: ['unarchive', '取消归档', 'アーカイブ解除'], invite: ['invite to', '邀请加入', '招待'], kick: ['remove from', '移出', '退出させる'], join: ['join', '加入', '参加'],
  leave: ['leave', '退出', '退出'], rename: ['rename', '重命名', '名前を変更'], open: ['open', '打开', '開く'], close: ['close', '关闭', '閉じる'], mark: ['mark', '标记', 'マーク'],
  import: ['import', '导入', 'インポート'], share: ['share', '共享', '共有'], publish: ['publish', '发布', '公開'], push: ['push', '推送', 'プッシュ'], enable: ['enable', '启用', '有効化'],
  disable: ['disable', '停用', '無効化'], approve: ['approve', '批准', '承認'], deny: ['deny', '拒绝', '拒否'], revoke: ['revoke', '撤销', '取り消し'], watch: ['watch', '监听', '監視'],
  stop: ['stop', '停止', '停止'], trash: ['trash', '移到回收站', 'ゴミ箱に移動'], untrash: ['restore', '从回收站恢复', 'ゴミ箱から戻す'], verify: ['verify', '验证', '検証'],
  end: ['end', '结束', '終了'], complete: ['complete', '完成', '完了'], uninstall: ['uninstall', '卸载', 'アンインストール'], connect: ['connect', '连接', '接続'],
  disconnect: ['disconnect', '断开', '切断'], restrict: ['restrict', '限制', '制限'], reset: ['reset', '重置', 'リセット'], invalidate: ['invalidate', '作废', '無効化'],
  assign: ['assign', '分配', '割り当て'], request: ['request', '申请', 'リクエスト'], exchange: ['exchange', '交换', '交換'], convert: ['convert', '转换', '変換'],
  unfurl: ['unfurl', '展开链接', 'リンクを展開'], sort: ['sort', '排序', '並べ替え'], generate: ['generate', '生成', '生成'], obliterate: ['permanently delete', '永久删除', '完全に削除'], urgent: ['send an urgent', '加急提醒', '至急通知'],
};
export const SENSITIVE = new Set(['delete', 'batch delete', 'obliterate', 'recall', 'withdraw']);

// RESOURCES: key (lower-case singular words; `<vendor>:key` wins for that vendor) → [zh, ja] (en = the key). A key
// with no row is composed from two that have one (「频道」+「历史」); else it is MISSING and reads its English split.
export const RESOURCES = {
  // Lark (Go SDK type names)
  'lark:app': ['多维表格', 'Base'], 'app role': ['自定义角色', 'カスタムロール'], 'app role member': ['自定义角色成员', 'カスタムロールのメンバー'],
  'app table': ['数据表', 'テーブル'], 'app table field': ['字段', 'フィールド'], 'app table record': ['多维表格记录', 'レコード'], 'app table view': ['视图', 'ビュー'],
  'batch message': ['批量消息', '一括メッセージ'], calendar: ['日历', 'カレンダー'], 'calendar acl': ['日历访问权限', 'カレンダーのアクセス権'], 'calendar event': ['日程', '予定'],
  'calendar event attendee': ['日程参与人', '予定の参加者'], 'calendar event attendee chat member': ['参与群的成员', '参加グループのメンバー'], chat: ['群', 'グループ'],
  'chat announcement': ['群公告', 'グループのお知らせ'], 'chat manager': ['群管理员', 'グループ管理者'], 'chat member': ['群成员', 'グループメンバー'],
  'chat moderation': ['群发言权限', 'グループの発言権限'], 'chat tab': ['群标签页', 'グループのタブ'], 'chat top notice': ['群置顶', 'グループのピン留め'],
  'custom attr': ['自定义字段', 'カスタム属性'], department: ['部门', '部署'], document: ['文档', 'ドキュメント'], 'document block': ['文档块', 'ドキュメントブロック'],
  'document block children': ['文档块的子块', 'ドキュメントブロックの子ブロック'], 'employee type enum': ['人员类型', '雇用区分'], file: ['文件', 'ファイル'],
  'file comment': ['文件评论', 'ファイルのコメント'], 'file comment reply': ['评论回复', 'コメントへの返信'], 'file statistic': ['文件统计', 'ファイル統計'],
  freebusy: ['忙闲', '空き時間'], group: ['用户组', 'ユーザーグループ'], 'group member': ['用户组成员', 'ユーザーグループのメンバー'], image: ['图片', '画像'],
  'import task': ['导入任务', 'インポートタスク'], media: ['素材', 'メディア'], message: ['消息', 'メッセージ'], 'message reaction': ['表情回复', 'リアクション'],
  'message resource': ['消息中的资源', 'メッセージのリソース'], 'permission member': ['协作者', '共同編集者'], 'permission public': ['公开权限', '公開設定'],
  setting: ['设置', '設定'], 'timeoff event': ['请假日程', '休暇の予定'], user: ['用户', 'ユーザー'],
  // Slack (method families + the words a method name carries)
  conversation: ['频道', 'チャンネル'], 'slack:chat': ['消息', 'メッセージ'], 'scheduled message': ['定时消息', '予約メッセージ'], 'file remote': ['远程文件', 'リモートファイル'],
  pin: ['置顶', 'ピン留め'], reaction: ['表情回应', 'リアクション'], reminder: ['提醒', 'リマインダー'], star: ['收藏', 'スター'], team: ['工作区', 'ワークスペース'],
  profile: ['资料', 'プロフィール'], usergroup: ['用户组', 'ユーザーグループ'], view: ['视图', 'ビュー'], dialog: ['对话框', 'ダイアログ'], dnd: ['勿扰', 'おやすみモード'],
  emoji: ['表情', '絵文字'], bot: ['机器人', 'ボット'], call: ['通话', '通話'], participant: ['参与人', '参加者'], auth: ['授权', '認証'], app: ['应用', 'アプリ'],
  workflow: ['工作流', 'ワークフロー'], topic: ['话题', 'トピック'], purpose: ['用途', '目的'], permalink: ['永久链接', 'パーマリンク'], presence: ['在线状态', '在席状況'],
  photo: ['头像', '写真'], history: ['历史', '履歴'], info: ['信息', '情報'], member: ['成员', 'メンバー'], reply: ['回复', '返信'], comment: ['评论', 'コメント'],
  admin: ['管理', '管理'], channel: ['频道', 'チャンネル'], name: ['名称', '名前'], owner: ['所有者', 'オーナー'], icon: ['图标', 'アイコン'],
  description: ['描述', '説明'], token: ['令牌', 'トークン'], migration: ['迁移', '移行'], snooze: ['暂停通知', '通知の一時停止'], expiration: ['有效期', '有効期限'],
  pref: ['偏好', '設定'], request: ['申请', 'リクエスト'], approved: ['已批准', '承認済み'], denied: ['已拒绝', '拒否済み'], restricted: ['受限', '制限済み'],
  session: ['会话', 'セッション'], invite: ['邀请', '招待'], log: ['日志', 'ログ'], access: ['访问', 'アクセス'], default: ['默认', 'デフォルト'], scope: ['权限范围', 'スコープ'],
  permission: ['权限', '権限'], resource: ['资源', 'リソース'], ephemeral: ['临时消息', '一時メッセージ'], 'rtm': ['实时连接', 'リアルタイム接続'], search: ['搜索', '検索'], 'scheduled message list': ['定时消息', '予約メッセージ'],
  // Gmail (discovery resources)
  'gmail:message': ['邮件', 'メール'], 'gmail:user': ['邮箱', 'メールボックス'], label: ['标签', 'ラベル'], draft: ['草稿', '下書き'], thread: ['邮件会话', 'スレッド'],
  attachment: ['附件', '添付ファイル'], filter: ['过滤器', 'フィルタ'], 'forwarding address': ['转发地址', '転送先アドレス'], identity: ['身份', 'ID'],
  delegate: ['委托人', '委任先'], 'send as': ['发件人别名', '送信元アドレス'], 'smime info': ['S/MIME 信息', 'S/MIME 情報'], keypair: ['密钥对', '鍵ペア'],
  vacation: ['自动回复', '不在通知'], imap: ['IMAP 设置', 'IMAP 設定'], pop: ['POP 设置', 'POP 設定'], language: ['语言', '言語'], 'auto forwarding': ['自动转发', '自動転送'],
};

// THE OBJECT a row names (card grammar ②): the first of these params the call has — its id becomes the object chip.
export const OBJECT_PARAMS = [['document_id', 'doc'], ['app_token', 'table'], ['chat_id', 'chat'], ['channel', 'chat'], ['folder_token', 'folder'], ['file_token', 'file'],
  ['calendar_id', 'calendar'], ['message_id', 'message'], ['user_id', 'person'], ['department_id', 'department'], ['id', null]];

const camel = (s) => String(s).match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) || [];
const single = (w) => (w.length <= 2 || /(ss|us|is|as)$/.test(w) ? w : /ies$/.test(w) ? `${w.slice(0, -3)}y` : /sses$/.test(w) ? w.slice(0, -2) : /s$/.test(w) ? w.slice(0, -1) : w);
/** 'DocumentBlockChildren' / 'files.comments' / 'sendAs' → 'document block children' / 'file comment' / 'send as'. */
export const keyOf = (s) => String(s).split('.').flatMap(camel).map((w) => single(w.toLowerCase())).join(' ');

function resourceWords(vendor, key, missing) {
  const hit = (k) => RESOURCES[`${vendor}:${k}`] || RESOURCES[k] || null;
  const compose = (k) => {   // a whole row, else two composed halves (「管理」+「应用申请」)
    const w = hit(k);
    if (w) return w;
    const t = k.split(' ');
    for (let i = 1; i < t.length; i++) {
      const a = compose(t.slice(0, i).join(' ')), b = a && compose(t.slice(i).join(' '));
      if (a && b) return [`${a[0]}${b[0]}`, `${a[1]}の${b[1]}`];
    }
    return null;
  };
  const w = compose(key);
  if (w) return { en: key, zh: w[0], ja: w[1] };
  missing.add(`${vendor}:${key}`);
  return { en: key, zh: key, ja: key };
}
/** A method name's words: {verb, tail} — 'BatchDelete' → batch delete; 'postMessage' → post + message; a noun ('history') → get + it. */
function verbOf(name) {
  const t = camel(name).map((w) => w.toLowerCase());
  const n = t[0] === 'batch' && VERBS[`batch ${t[1]}`] ? 2 : 1;
  const v = t.slice(0, n).join(' ');
  if (VERBS[v]) return { verb: v, tail: t.slice(n)[0] === 'by' ? '' : keyOf(t.slice(n).join('.')) };
  const k = t.findIndex((w) => VERBS[w]);   // MeJoin = join
  if (k > 0) return { verb: t[k], tail: keyOf(t.slice(k + 1).join('.')) };
  return { verb: 'get', tail: keyOf(t.join('.')) };
}

function phraseOf(vendor, verb, resKey, objKind, missing) {
  const v = VERBS[verb], r = resourceWords(vendor, resKey, missing), o = objKind !== undefined && objKind !== false;
  return [`${v[0]} ${r.en}${o ? ' “{object}”' : ''}`,   // en quotes the object like the hand rows (a `word (` reads as a call to the bundle's bare-call scan)
    `${v[1]} ${r.zh}${o ? '（{object}）' : ''}`, `${r.ja}を${v[2]}${o ? '（{object}）' : ''}`];
}
const objectOf = (params, resKey) => {
  for (const [p, kind] of OBJECT_PARAMS) if (params.includes(p)) return { param: p, kind: kind || resKey.split(' ').pop() };
  return null;
};

function slackRows(missing) {
  const spec = JSON.parse(fs.readFileSync(path.join(SPECS, 'slack-web-openapi-v2.json'), 'utf8'));
  const rows = [];
  for (const [p, ops] of Object.entries(spec.paths)) {
    for (const [m, op] of Object.entries(ops)) {
      const segs = p.slice(1).split('.'), name = segs.pop();
      const fam = keyOf(segs.join('.'));
      const famVerb = VERBS[segs[segs.length - 1]] ? segs[segs.length - 1] : null;   // search.messages = search + messages
      const { verb, tail } = famVerb ? { verb: famVerb, tail: keyOf(name) } : verbOf(name);
      const res = tail && !famVerb ? (tail === fam ? fam : tail) : famVerb ? tail : fam;
      const names = (op.parameters || []).map((x) => x && x.name).filter(Boolean);
      const obj = objectOf(names.filter((x) => x === 'channel'), res);
      rows.push({ id: `slack.${p.slice(1)}`, vendor: 'slack', method: m.toUpperCase(), path: `/api${p}`, verb, res, obj });
    }
  }
  return rows.map((r) => ({ ...r, phrase: phraseOf('slack', r.verb, r.res, r.obj ? r.obj.kind : undefined, missing) }));
}

function gmailRows(missing) {
  const spec = JSON.parse(fs.readFileSync(path.join(SPECS, 'gmail-v1-discovery.json'), 'utf8'));
  const rows = [];
  const walk = (r) => {
    for (const m of Object.values(r.methods || {})) {
      const ids = m.id.split('.'), name = ids.pop(), fam = keyOf(ids[ids.length - 1]);
      const { verb, tail } = verbOf(name);
      const res = tail || fam;
      const params = [...String(m.path).matchAll(/\{\+?(\w+)\}/g)].map((x) => x[1]).filter((x) => x !== 'userId');
      const obj = params.length ? { param: params[params.length - 1], kind: res.split(' ').pop() } : null;
      rows.push({ id: m.id, vendor: 'google', method: m.httpMethod, path: `/${String(m.path).replace(/\{\+(\w+)\}/g, '{$1}')}`, verb, res, obj });
    }
    for (const s of Object.values(r.resources || {})) walk(s);
  };
  walk(spec);
  return rows.map((r) => ({ ...r, phrase: phraseOf('gmail', r.verb, r.res, r.obj ? r.obj.kind : undefined, missing) }));
}

function larkRows(missing) {
  const dir = path.join(SPECS, 'lark-go');
  const rows = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.api.go')).sort()) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const svc = f.replace(/\.api\.go$/, '');
    // `func (x *<Resource>Service) <Verb>(…) *<Call>ReqCall {` names the call; its Do() holds `request.NewRequest("<path>", "<METHOD>"`.
    const callOf = new Map();
    for (const m of src.matchAll(/^func \(\w+ \*(\w+)Service\) (\w+)\([^\n]*\) \*(\w+)ReqCall \{/gm)) callOf.set(m[3], { type: m[1], name: m[2] });
    for (const m of src.matchAll(/^func \(rc \*(\w+)ReqCall\) Do\(\)[^\n]*\n(?:[^\n]*\n){0,8}?\s*req := request\.NewRequest\("([^"]+)", "([A-Z]+)"/gm)) {
      const c = callOf.get(m[1]);
      if (!c) continue;
      const { verb } = verbOf(c.name), res = keyOf(c.type);   // the Go type IS the resource (a method's tail — UploadAll's All — is not)
      const p = `/${m[2].replace(/^\/?(open-apis\/)?/, 'open-apis/')}`.replace(/:(\w+)/g, '{$1}');   // a few SDK paths omit /open-apis
      const obj = objectOf([...p.matchAll(/\{(\w+)\}/g)].map((x) => x[1]), res);
      rows.push({ id: `lark.${svc}.${c.type}.${c.name}`, vendor: 'lark', method: m[3], path: p, verb, res, obj });
    }
  }
  return rows.map((r) => ({ ...r, phrase: phraseOf('lark', r.verb, r.res, r.obj ? r.obj.kind : undefined, missing) }));
}

export function build() {
  const sums = fs.readFileSync(path.join(SPECS, 'SHA256SUMS'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/));
  for (const [sha, f] of sums) {
    const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(SPECS, f))).digest('hex');
    if (got !== sha) throw new Error(`scripts/api-specs/${f}: sha256 ${got} ≠ the pin ${sha} (refresh with fetch.sh, then re-pin)`);
  }
  const missing = new Set();
  const lit = (p) => p.split('/').filter((s) => s && !/^\{/.test(s)).length;
  const rows = [...larkRows(missing), ...slackRows(missing), ...gmailRows(missing)]
    .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.method.localeCompare(b.method) || lit(b.path) - lit(a.path) || a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
  const phrases = [], ixOf = new Map();
  const ix = (ph) => { const k = JSON.stringify(ph); if (!ixOf.has(k)) { ixOf.set(k, phrases.length); phrases.push(ph); } return ixOf.get(k); };
  const out = rows.map((r) => [r.id, r.vendor, r.method, r.path, ix(r.phrase), r.obj ? r.obj.param : 0, r.obj ? r.obj.kind : 0, SENSITIVE.has(r.verb) ? 1 : 0]);
  const J = (x) => JSON.stringify(x);
  return [
    "'use strict';",
    '// GENERATED by scripts/gen-api-call-words.mjs from scripts/api-specs/* (the vendors\' own catalogues) — do not edit;',
    '// re-run `node scripts/gen-api-call-words.mjs`. test-api-call-words fails when this file is not what the sources make.',
    '// ROWS: [id, vendor, METHOD, path pattern ({param} slots), phrase index, object param, object kind, verb says sensitive]',
    '// PHRASES: [en, zh, ja] — `{object}` = the named thing (src/api-call-words.js fills it like the hand rows do).',
    'module.exports = Object.freeze({',
    `  SOURCES: Object.freeze(${J(Object.fromEntries(sums.map(([s, f]) => [f, s])))}),`,
    `  MISSING: Object.freeze(${J([...missing].sort())}),`,
    '  PHRASES: Object.freeze([',
    ...phrases.map((p) => `    ${J(p)},`),
    '  ]),',
    '  ROWS: Object.freeze([',
    ...out.map((r) => `    ${J(r)},`),
    '  ]),',
    '});',
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = build();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== text) { console.error('src/api-call-words.generated.js is stale — run node scripts/gen-api-call-words.mjs'); process.exit(1); }
    console.log('src/api-call-words.generated.js matches the vendored catalogues');
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`wrote ${path.relative(ROOT, OUT)} (${text.length} bytes)`);
  }
}
