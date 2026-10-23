'use strict';
// THE PATH FIELD ON ANOTHER MACHINE (lane path-field — the owner's note ④ «为啥在 mac 选项下就没有默认路径推荐了？»): the ONE
// sh script the host rung runs there (over the device link's runCmd, else ssh — src/hosts.js dirSlice) and the parser of
// what it prints. One round trip states everything the field needs for one text: the folders to LIST (kids, git, links,
// files when the field takes files, a home folder's package.json named vibespace = the instance's own checkout), the
// folders to PROBE (a Task Group's folders at the same place under that machine's home, its recents, the name-derived
// ones: exists / git / file count / mtime), the folder INDEX for the fuzzy search (find, 4 levels, ≤ 6000, dot /
// dependency folders and ~/Library pruned), the machine's MOUNTS (/Volumes on a Mac, /mnt /media and under the home
// elsewhere) and the OS's DISPLAY NAMES of the home's folders on a Mac (mdls kMDItemDisplayName — 文稿 for Documents).
// Portable sh (GNU + BSD stat), bounded, every path single-quoted. The parsed facts feed PURE src/path-candidates.js
// sliceListing — the same listing this machine's SafeFs answer builds.
// PURE: imports nothing.

const MAX_KIDS = 400;
const MAX_INDEX = 6000;

/** a path for the script: `~` / `~/x` against the machine's home, else single-quoted verbatim */
const qp = (p) => {
  const s = String(p || '');
  const q = (x) => `'${x.replace(/'/g, `'\\''`)}'`;
  if (s === '~') return '"$H"';
  if (s.startsWith('~/')) return '"$H"' + q(s.slice(1));
  return q(s);
};

/** The script. list / probes = paths (`~/…` or absolute); files = list files too; index = walk the folder index; names =
 *  the Mac's display names; skip = absolute paths the index never enters. */
function sliceScript({ list = [], probes = [], files = false, index = false, names = false, skip = [] } = {}) {
  const L = [];
  L.push(`H="$HOME"; U=$(uname -s 2>/dev/null); printf 'H\\t%s\\nU\\t%s\\n' "$H" "$U"`);
  L.push(`mt() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }`);
  L.push(`sz() { stat -c %s "$1" 2>/dev/null || stat -f %z "$1" 2>/dev/null; }`);
  L.push(`ls1() { d=$1; f=$2; k=$3; if [ ! -d "$d" ]; then printf 'X\\t%s\\n' "$d"; return; fi; g=0; [ -e "$d/.git" ] && g=1; printf 'D\\t%s\\t%s\\t%s\\n' "$d" "$(mt "$d")" "$g"; n=0; `
    + `for e in "$d"/* "$d"/.[!.]* "$d"/..?*; do [ -e "$e" ] || [ -L "$e" ] || continue; n=$((n+1)); if [ $n -gt ${MAX_KIDS} ]; then printf 'Z\\t%s\\n' "$d"; break; fi; b=\${e##*/}; `
    + `if [ -L "$e" ]; then if [ -d "$e" ]; then printf 'L\\t%s\\t%s\\t%s\\n' "$d" "$b" "$(cd "$e" 2>/dev/null && pwd -P)"; elif [ -f "$e" ]; then printf 'f\\t%s\\n' "$d"; fi; continue; fi; `
    + `if [ -d "$e" ]; then kg=0; [ -e "$e/.git" ] && kg=1; kp=; if [ "$k" = 1 ] && [ -f "$e/package.json" ] && grep -q '"name"[[:space:]]*:[[:space:]]*"vibespace"' "$e/package.json" 2>/dev/null; then kp=vibespace; fi; printf 'K\\t%s\\t%s\\t%s\\t%s\\n' "$d" "$b" "$kg" "$kp"; `
    + `elif [ -f "$e" ]; then if [ "$f" = 1 ]; then printf 'F\\t%s\\t%s\\t%s\\t%s\\n' "$d" "$b" "$(sz "$e")" "$(mt "$e")"; else printf 'f\\t%s\\n' "$d"; fi; fi; done; }`);
  L.push(`pr() { p=$1; if [ -d "$p" ]; then g=0; [ -e "$p/.git" ] && g=1; c=$(find "$p" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' '); printf 'P\\t%s\\t1\\t1\\t%s\\t%s\\t%s\\n' "$p" "$g" "$c" "$(mt "$p")"; elif [ -e "$p" ]; then printf 'P\\t%s\\t1\\t0\\n' "$p"; else printf 'P\\t%s\\t0\\n' "$p"; fi; }`);
  for (const p of list) L.push(`ls1 ${qp(p)} ${files ? 1 : 0} ${p === '~' ? 1 : 0}`);
  for (const p of probes) L.push(`pr ${qp(p)}`);
  if (index) {
    const sk = skip.map((p) => `-o -path ${qp(p)}`).join(' ');
    L.push(`find "$H" -maxdepth 4 \\( -name '.*' -o -name node_modules -o -name __pycache__ -o -name venv -o -name site-packages -o -path "$H/Library" ${sk} \\) -prune -o -type d -print 2>/dev/null | head -n ${MAX_INDEX} | awk '{ print "I\\t" $0 }'`);
    L.push(`find "$H" -maxdepth 2 -type l 2>/dev/null | head -n 200 | while IFS= read -r l; do [ -d "$l" ] && printf 'A\\t%s\\t%s\\n' "$l" "$(cd "$l" 2>/dev/null && pwd -P)"; done`);
  }
  L.push(`if [ "$U" = Darwin ]; then for v in /Volumes/*; do [ -d "$v" ] && [ ! -L "$v" ] && printf 'M\\t%s\\t%s\\n' "$v" "\${v##*/}"; done; else awk -v h="$H/" '($2 ~ /^\\/(mnt|media)\\//) || (index($2, h) == 1) { gsub(/\\\\040/, " ", $2); print "M\\t" $2 "\\t" $3 }' /proc/mounts 2>/dev/null; fi`);
  if (names) L.push(`if [ "$U" = Darwin ] && command -v mdls >/dev/null 2>&1; then for e in "$H"/*; do [ -d "$e" ] || continue; nm=$(mdls -raw -name kMDItemDisplayName "$e" 2>/dev/null); [ -n "$nm" ] && [ "$nm" != "(null)" ] && [ "$nm" != "\${e##*/}" ] && printf 'N\\t%s\\t%s\\n' "$e" "$nm"; done; fi`);
  L.push('echo VS-SLICE-END');
  return L.join('\n');
}

/** What the script printed → { home, os, done, dirs, probes, index: { dirs, links }, mounts, localized } (raw facts,
 *  absolute paths — the shapes sliceListing takes). */
function parseSlice(out) {
  const r = { home: '', os: '', done: false, dirs: [], probes: [], index: { dirs: [], links: [] }, mounts: [], localized: {} };
  const byDir = new Map();
  const dir = (p) => byDir.get(p);
  for (const line of String(out || '').split('\n')) {
    if (line === 'VS-SLICE-END') { r.done = true; continue; }
    const f = line.split('\t');
    switch (f[0]) {
      case 'H': r.home = f[1] || ''; break;
      case 'U': r.os = f[1] || ''; break;
      case 'X': r.dirs.push({ path: f[1], exists: false }); break;
      case 'D': { const d = { path: f[1], exists: true, isDir: true, mtime: (Number(f[2]) || 0) * 1000, git: f[3] === '1', kids: [], fileCount: 0, more: false }; byDir.set(f[1], d); r.dirs.push(d); break; }
      case 'K': { const d = dir(f[1]); if (d && f[2]) d.kids.push({ name: f[2], git: f[3] === '1', ...(f[4] ? { pkg: f[4] } : {}) }); break; }
      case 'L': { const d = dir(f[1]); if (d && f[2] && f[3]) d.kids.push({ name: f[2], git: false, link: f[3] }); break; }
      case 'F': { const d = dir(f[1]); if (d && f[2]) { d.fileCount++; (d.files = d.files || []).push({ name: f[2], size: Number(f[3]) || 0, mtime: (Number(f[4]) || 0) * 1000 }); } break; }
      case 'f': { const d = dir(f[1]); if (d) d.fileCount++; break; }
      case 'Z': { const d = dir(f[1]); if (d) d.more = true; break; }
      case 'P': r.probes.push(f[2] === '1' ? (f[3] === '1' ? { path: f[1], exists: true, isDir: true, git: f[4] === '1', fileCount: f[5] === '' || f[5] == null ? null : Number(f[5]), mtime: (Number(f[6]) || 0) * 1000 } : { path: f[1], exists: true, isDir: false }) : { path: f[1], exists: false }); break;
      case 'I': if (f[1]) r.index.dirs.push(f[1]); break;
      case 'A': if (f[1] && f[2]) r.index.links.push({ from: f[1], to: f[2] }); break;
      case 'M': if (f[1]) r.mounts.push({ path: f[1], label: f[2] || '' }); break;
      case 'N': if (f[1] && f[2]) r.localized[f[1]] = f[2]; break;
      default: break;
    }
  }
  /* a folder asked for files keeps an empty list (the field knows there are none) */
  for (const d of r.dirs) if (d.exists && !d.files && d.fileCount === 0) d.files = d.files || undefined;
  return r;
}

module.exports = { sliceScript, parseSlice, qp, MAX_KIDS, MAX_INDEX };
