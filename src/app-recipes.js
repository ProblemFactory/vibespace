'use strict';
/**
 * RECIPES — A SMALL TABLE, NOT A STORE (design 009 §2 A). PURE: imports nothing; CJS so the hub, the bundle and the
 * daemon share one spelling. ≤ 12 rows for the apps people ask for by NAME that no Debian source carries: each is
 * `{id, names, publisher, url, hosts, kind}` — `url` the vendor's stable "latest" address (checked 2026-10-03 with a HEAD
 * request: each answered 200 at the end of its redirects), `hosts` every site that chain may pass through.
 * It does two things only:
 *   · search — `vibespace-app search 微信` and the Apps search box find a row by any of its names (CJK included);
 *   · vouching — a card whose download passed ONLY through a row's hosts may say "official download address"
 *     (`recipeFor(hosts)`); any other address is a plain download the card says VibeSpace cannot vouch for.
 * A row whose address stops answering is a refused fetch BY NAME (the agent hears it) — never a silent fallback.
 * Feishu / Lark and QQ publish versioned addresses only (no stable "latest" one found) — not rows.
 */
const RECIPES = Object.freeze([
  { id: 'wechat', names: ['WeChat', '微信', 'weixin', 'wechat'], publisher: 'Tencent', url: 'https://dldir1v6.qq.com/weixin/Universal/Linux/WeChatLinux_x86_64.deb', hosts: ['dldir1v6.qq.com'], kind: 'deb' },
  { id: 'chrome', names: ['Google Chrome', 'Chrome', '谷歌浏览器', 'google-chrome'], publisher: 'Google', url: 'https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb', hosts: ['dl.google.com'], kind: 'deb' },
  { id: 'vscode', names: ['Visual Studio Code', 'VS Code', 'vscode'], publisher: 'Microsoft', url: 'https://update.code.visualstudio.com/latest/linux-deb-x64/stable', hosts: ['update.code.visualstudio.com', 'vscode.download.prss.microsoft.com'], kind: 'deb' },
  { id: 'edge', names: ['Microsoft Edge', 'Edge', 'microsoft-edge'], publisher: 'Microsoft', url: 'https://go.microsoft.com/fwlink?linkid=2149051', hosts: ['go.microsoft.com', 'packages.microsoft.com'], kind: 'deb' },
  { id: 'zoom', names: ['Zoom', 'zoom'], publisher: 'Zoom', url: 'https://zoom.us/client/latest/zoom_amd64.deb', hosts: ['zoom.us', 'cdn.zoom.us'], kind: 'deb' },
  { id: 'discord', names: ['Discord', 'discord'], publisher: 'Discord', url: 'https://discord.com/api/download?platform=linux&format=deb', hosts: ['discord.com', 'stable.dl2.discordapp.net', 'dl.discordapp.net'], kind: 'deb' },
  { id: 'teamviewer', names: ['TeamViewer', 'teamviewer'], publisher: 'TeamViewer', url: 'https://download.teamviewer.com/download/linux/teamviewer_amd64.deb', hosts: ['download.teamviewer.com', 'dl.teamviewer.com'], kind: 'deb' },
  { id: 'steam', names: ['Steam', 'steam'], publisher: 'Valve', url: 'https://cdn.akamai.steamstatic.com/client/installer/steam.deb', hosts: ['cdn.akamai.steamstatic.com', 'repo.steampowered.com'], kind: 'deb' },
].map((r) => Object.freeze({ ...r, names: Object.freeze(r.names), hosts: Object.freeze(r.hosts) })));

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s._-]+/g, '');
/** The rows a person's words name (any name contains the query or the query contains a name; ≥ 2 characters). */
function searchRecipes(query) {
  const q = norm(query);
  if (q.length < 2 && !/[^\x00-\x7f]/.test(q)) return [];
  // a name inside the query counts when it is CJK or ≥ 5 letters ("装微信" finds WeChat; "knowledge" never finds Edge)
  return RECIPES.filter((r) => r.names.some((n) => { const x = norm(n); return x === q || (q.length >= 2 && x.includes(q)) || ((/[^\x00-\x7f]/.test(x) || x.length >= 5) && q.includes(x)); }));
}
/** The row that vouches for a download whose every hop's host is among its own hosts (the first hop included), or null. */
function recipeFor(hosts) {
  const hs = (Array.isArray(hosts) ? hosts : []).map((h) => String(h).toLowerCase());
  if (!hs.length) return null;
  return RECIPES.find((r) => hs.every((h) => r.hosts.includes(h))) || null;
}
const byId = (id) => RECIPES.find((r) => r.id === id) || null;
/** What a search answer carries for a row (the client and the agent CLI read it). */
const publicRow = (r) => ({ id: r.id, name: r.names[0], names: [...r.names], publisher: r.publisher, url: r.url, kind: r.kind });

module.exports = { RECIPES, searchRecipes, recipeFor, byId, publicRow };
