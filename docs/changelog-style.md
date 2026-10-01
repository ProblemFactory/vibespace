# The changelog is for the person using VibeSpace

`CHANGELOG.md` is what a user reads — in the ⚙ → Update VibeSpace dialog (every entry between the running version and the latest) and on GitHub. It says what changed FOR THEM, in their words, one line per change. Everything an engineer wants to remember about a release — why, how it was verified, what the gates found, invariants, incident numbers — goes to `docs/changelog-engineering.md` under the same version heading (that file holds the pre-2026-09-29 changelog verbatim; it is ours, not the user's), and the lasting rules go to the kb files as before.

## Format (enforced by `scripts/test-changelog-style.mjs`)

```
## 2.369.197 — 2026-09-29

### Added
- Right-click an Activity entry, a For-you item, a status entry, a background job or a group message → "Clear content…" removes its text everywhere; the record keeps its place and time.
- Channels show threads and emoji reactions; a reply says what it answers and where it will land.

### Changed
- Gmail messages are shown with their formatting (remote pictures only when you ask); Lark messages no longer show raw tags, cards show their contents and bots are named.

### Fixed
- While you drive the agent's browser, a click into the chat box or a terminal lets you type there.
- A file saved from a preview keeps its own name instead of "raw".
```

- **The file starts** with its title (`# Changelog` / `# 更新日志` / `# 更新履歴`) and ONE intro line pointing at the engineering log; then the entries.
- **Heading:** `## <version> — <YYYY-MM-DD>`. Nothing else on the line.
- **Sections**, in this order, only the ones with content: `### Added` · `### Changed` · `### Fixed` · `### Removed` · `### Security` · `### Maintenance`. A version with nothing a user would notice has one `### Maintenance` line: `- Test and release tooling only; nothing changes for you.`
- **Bullets:** one line each, one sentence, at most 160 characters, plain words. Say what the person sees or can do now ("You can now…", "X no longer…", "A … is shown …"). Name things as the UI names them (For you, Channels, Agent browser, Background Work, Task Group, the Update dialog).
- **Never in this file:** lane / round / verify / census / control / patched copy; suite or file names (`test-…`, `src/…`, `scripts/…`); function names; commit shas; backlog or incident ids (`B-…`, `inc-…`); `§`, `不变量`, kb references; quotes of the owner's messages; counts of tests; how something was measured. If a sentence needs any of those, it belongs in the engineering log.
- **One entry per version**, newest first, dates never increasing downwards. No prose between the heading and the first section.
- **The newest entry is the release being cut:** package.json's version — or the next patch while a branch's release is written before the bump.

## The engineering log

`docs/changelog-engineering.md` — same heading (`## <version> — <date>`), free-form below it: the lanes, the verification rounds and their findings, the gate reds and their causes, measurements, the choices made and why. Write it in the same commit as the release; the style gate checks that every version in `CHANGELOG.md` from 2.369.198 on has a section there.

## Writing a release entry (the integrator, or whoever bumps the version)

1. List what a user would notice, one line each, under Added / Changed / Fixed (Security for a fix that closes a way in; Removed for a feature taken away).
2. Put the rest — everything you would tell another engineer — under the same version in the engineering log.
3. The commit subject is the version and one short line (≤ 72 characters); the body may repeat the user-facing bullets.

## Three languages, one structure

The changelog is shown in the language of the interface: `CHANGELOG.md` (English, the canonical text), `CHANGELOG.zh.md` (简体中文), `CHANGELOG.ja.md` (日本語). Every language file has the SAME versions in the same order, the same heading line (`## <version> — <date>`), the same sections in the same order and the same number of bullets — only the words differ (the style gate checks this parity, so a translation can never drift). Section names per language:

| en | zh | ja |
|---|---|---|
| Added | 新增 | 追加 |
| Changed | 更改 | 変更 |
| Fixed | 修复 | 修正 |
| Removed | 移除 | 削除 |
| Security | 安全 | セキュリティ |
| Maintenance | 维护 | メンテナンス |

Maintenance line: en `Test and release tooling only; nothing changes for you.` · zh `仅测试与发布工具的改动；对你没有影响。` · ja `テストとリリースツールのみの変更です。使い方は変わりません。`

Translations are written as a native product changelog would be (not word-for-word): 简体中文 bullets ≤ 90 characters, 日本語 bullets ≤ 90 characters, product names as the interface itself names them (the dictionaries `src/lib/i18n-zh.js` / `src/lib/i18n-ja.js` hold the UI's words — e.g. For you = 待办 / For you, Channels = 通讯 …; use the dictionary's spelling). Never quote anyone's messages in any language.
