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
// B-99b9 (lane bl-machines-b, 主开发 r826 — THE SMALLER SHAPE): the hub runs this script as TWO asks (src/hosts.js dirSlice: the
// TYPED folders alone, and the rest), and the script itself never touches what can hang it needlessly: the machine's MOUNT
// POINTS are read without touching one (the kernel's table on Linux, autofs included; the mount program's own output on macOS);
// a child that IS a mount point, and every child of an autofs folder, is printed BY NAME ONLY (no test of it); NO LINK IS
// FOLLOWED (its target printed as read, never tested — a link is asked about before any stat of it; the hub keeps it UNCHECKED:
// never a folder, never a check mark); a name or a target holding a tab or a newline is never listed (it could fake a row);
// the walk prunes every mount point under the home. 主开发 r949: THE MOUNT TEST COMPARES REAL PATHS — the kernel's table holds them:
// a listed folder's real path is asked ONCE, of the folder itself (`cd -P` + `pwd -P`, never of a child), and its children are compared
// under it as well as as typed (what is printed stays as typed); the walk prunes by the home's real path the same way; on a Mac a
// mount behind the data volume (/System/Volumes/Data/…) is known by its path without that prefix too. A child's own .git and
// package.json are tested only when they are not links (a link named so is never followed), and an automounter's folder has no
// .git test of its own (that would ask the automounter for a key). THE SHELLS it is written for: a plain POSIX sh — dash, busybox ash, bash as
// sh (macOS /bin/sh) — with readlink, awk, cut and the stat / find forms above; nothing beyond them. Nothing is written,
// detached or left running on the machine by it.
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
  // B-99b9: THE MOUNT POINTS, read WITHOUT touching one — MT = «path<TAB>type» lines, MP = every mount point, AP = the autofs ones
  L.push("NL='\n'; TB=$(printf '\\t')");
  L.push(`if [ "$U" = Darwin ]; then MT=$(mount 2>/dev/null | awk '{ i = index($0, " on "); j = index($0, " ("); if (i && j > i) { t = substr($0, j + 2); sub(/[,)].*/, "", t); p = substr($0, i + 4, j - i - 4); print p "\\t" t; if (index(p, "/System/Volumes/Data/") == 1) print substr(p, 21) "\\t" t } }'); `
    + `else MT=$(awk '{ gsub(/\\\\040/, " ", $2); print $2 "\\t" $3 }' /proc/mounts 2>/dev/null); fi; `
    + `MP=$(printf '%s\\n' "$MT" | cut -f1); AP=$(printf '%s\\n' "$MT" | awk -F '\\t' '$2 == "autofs" { print $1 }')`);
  L.push(`inm() { case "$NL$2$NL" in *"$NL$1$NL"*) return 0;; esac; return 1; }`);
  // r949: the HOME's real path, asked once of the home itself (only by the steps that walk it): the table holds real paths
  L.push(`RH=; rh() { [ -n "$RH" ] && return 0; RH=$(cd -P "$H" 2>/dev/null && pwd -P) || RH=$H; RH=\${RH%/}; }`);
  L.push(`mt() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }`);
  L.push(`sz() { stat -c %s "$1" 2>/dev/null || stat -f %z "$1" 2>/dev/null; }`);
  // B-99b9: a child that IS a mount point, and every child of an autofs folder, BY NAME ONLY (no test of it); a link's target as
  // read (never tested, never followed); a name with a tab or a newline never listed
  L.push(`ls1() { d=$1; f=$2; k=$3; if [ ! -d "$d" ]; then printf 'X\\t%s\\n' "$d"; return; fi; p=\${d%/}; rp=$(cd -P "$d" 2>/dev/null && pwd -P) || rp=$p; rp=\${rp%/}; au=0; { inm "$d" "$AP" || inm "\${rp:-/}" "$AP"; } && au=1; g=0; [ $au = 1 ] || [ -L "$d/.git" ] || { [ -e "$d/.git" ] && g=1; }; printf 'D\\t%s\\t%s\\t%s\\n' "$d" "$(mt "$d")" "$g"; n=0; p=\${d%/}; `
    + `for e in "$p"/* "$p"/.[!.]* "$p"/..?*; do b=\${e##*/}; case "$b" in *"$TB"*|*"$NL"*) continue;; esac; `
    + `if [ $au = 1 ] || inm "$e" "$MP" || { [ "$rp" != "$p" ] && inm "$rp/$b" "$MP"; }; then case "$b" in '*'|'.[!.]*'|'..?*') continue;; esac; n=$((n+1)); if [ $n -gt ${MAX_KIDS} ]; then printf 'Z\\t%s\\n' "$d"; break; fi; printf 'K\\t%s\\t%s\\t0\\t\\tm\\n' "$d" "$b"; continue; fi; `
    + `if [ -L "$e" ]; then n=$((n+1)); if [ $n -gt ${MAX_KIDS} ]; then printf 'Z\\t%s\\n' "$d"; break; fi; t=$(readlink "$e" 2>/dev/null); case "$t" in *"$TB"*|*"$NL"*) continue;; esac; printf 'L\\t%s\\t%s\\t%s\\n' "$d" "$b" "$t"; continue; fi; `
    + `[ -e "$e" ] || continue; n=$((n+1)); if [ $n -gt ${MAX_KIDS} ]; then printf 'Z\\t%s\\n' "$d"; break; fi; `
    + `if [ -d "$e" ]; then kg=0; [ -L "$e/.git" ] || { [ -e "$e/.git" ] && kg=1; }; kp=; if [ "$k" = 1 ] && [ ! -L "$e/package.json" ] && [ -f "$e/package.json" ] && grep -q '"name"[[:space:]]*:[[:space:]]*"vibespace"' "$e/package.json" 2>/dev/null; then kp=vibespace; fi; printf 'K\\t%s\\t%s\\t%s\\t%s\\n' "$d" "$b" "$kg" "$kp"; `
    + `elif [ -f "$e" ]; then if [ "$f" = 1 ]; then printf 'F\\t%s\\t%s\\t%s\\t%s\\n' "$d" "$b" "$(sz "$e")" "$(mt "$e")"; else printf 'f\\t%s\\n' "$d"; fi; fi; done; }`);
  L.push(`pr() { p=$1; if [ -d "$p" ]; then g=0; inm "$p" "$AP" || [ -L "$p/.git" ] || { [ -e "$p/.git" ] && g=1; }; c=$(find "$p" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' '); printf 'P\\t%s\\t1\\t1\\t%s\\t%s\\t%s\\n' "$p" "$g" "$c" "$(mt "$p")"; elif [ -e "$p" ]; then printf 'P\\t%s\\t1\\t0\\n' "$p"; else printf 'P\\t%s\\t0\\n' "$p"; fi; }`);
  for (const p of list) L.push(`ls1 ${qp(p)} ${files ? 1 : 0} ${p === '~' ? 1 : 0}`);
  for (const p of probes) L.push(`pr ${qp(p)}`);
  if (index) {
    const sk = skip.map((p) => `-o -path ${qp(p)}`).join(' ');
    // B-99b9: the walk PRUNES every mount point under the home (the machine's own table: never entered); the links are read
    // as written (readlink), never followed
    L.push(`rh; pm() { set -f; o=$IFS; IFS=$NL; for m in $MP; do case "$m" in "$H"/*) printf '%s\\n' "$m";; esac; if [ "$RH" != "$H" ]; then case "$m" in "$RH"/*) printf '%s\\n' "$H\${m#"$RH"}";; esac; fi; done; IFS=$o; set +f; }`);
    L.push(`set -- "$H" -maxdepth 4 \\( -name '.*' -o -name node_modules -o -name __pycache__ -o -name venv -o -name site-packages -o -path "$H/Library" ${sk}; `
      + `set -f; o=$IFS; IFS=$NL; for m in $(pm); do set -- "$@" -o -path "$m"; done; IFS=$o; set +f; `
      + `find "$@" \\) -prune -o -type d -print 2>/dev/null | head -n ${MAX_INDEX} | awk '{ print "I\\t" $0 }'`);
    L.push(`set -- "$H" -maxdepth 2; set -f; o=$IFS; IFS=$NL; for m in $(pm); do set -- "$@" -path "$m" -prune -o; done; IFS=$o; set +f; `
      + `find "$@" -type l -print 2>/dev/null | head -n 200 | while IFS= read -r l; do t=$(readlink "$l" 2>/dev/null); [ -n "$t" ] && case "$t$l" in *"$TB"*|*"$NL"*) ;; *) printf 'A\\t%s\\t%s\\n' "$l" "$t";; esac; done`);
  }
  // B-99b9: the mount ROWS from the table read above (a Mac's /Volumes, /mnt /media and the home's elsewhere) — no stat of one
  L.push(`printf '%s\\n' "$MT" | awk -F '\\t' -v h="$H/" -v u="$U" '$1 != "" { if (u == "Darwin") { if ($1 ~ /^\\/Volumes\\//) { n = split($1, a, "/"); print "M\\t" $1 "\\t" a[n] } } else if ($1 ~ /^\\/(mnt|media)\\// || index($1, h) == 1) print "M\\t" $1 "\\t" $2 }'`);
  if (names) L.push(`if [ "$U" = Darwin ] && command -v mdls >/dev/null 2>&1; then rh; for e in "$H"/*; do [ -L "$e" ] && continue; inm "$e" "$MP" && continue; [ "$RH" != "$H" ] && inm "$RH/\${e##*/}" "$MP" && continue; [ -d "$e" ] || continue; nm=$(mdls -raw -name kMDItemDisplayName "$e" 2>/dev/null); [ -n "$nm" ] && [ "$nm" != "(null)" ] && [ "$nm" != "\${e##*/}" ] && printf 'N\\t%s\\t%s\\n' "$e" "$nm"; done; fi`);
  L.push('echo VS-SLICE-END');
  return L.join('\n');
}

/** B-99b9: a link's target as the machine wrote it → an absolute path (a relative one against the link's own folder; `.` and
 *  `..` folded by name — nothing is asked of the machine) */
function linkTo(dir, target) {
  const t = String(target || '');
  const parts = (t.startsWith('/') ? t : String(dir || '/') + '/' + t).split('/');
  const out = [];
  for (const x of parts) { if (!x || x === '.') continue; if (x === '..') out.pop(); else out.push(x); }
  return '/' + out.join('/');
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
      case 'H': if (!r.home) r.home = f[1] || ''; break;   // B-99b9: said once, first (a row a name forged could never move it)
      case 'U': if (!r.os) r.os = f[1] || ''; break;
      case 'X': r.dirs.push({ path: f[1], exists: false }); break;
      case 'D': { const d = { path: f[1], exists: true, isDir: true, mtime: (Number(f[2]) || 0) * 1000, git: f[3] === '1', kids: [], fileCount: 0, more: false }; byDir.set(f[1], d); r.dirs.push(d); break; }
      case 'K': { const d = dir(f[1]); if (d && f[2]) d.kids.push({ name: f[2], git: f[3] === '1', ...(f[4] ? { pkg: f[4] } : {}), ...(f[5] === 'm' ? { mount: true } : {}) }); break; }   // B-99b9: `mount` = a mount point said by name only
      case 'L': { const d = dir(f[1]); if (d && f[2] && f[3]) d.kids.push({ name: f[2], git: false, link: linkTo(f[1], f[3]), unchecked: true }); break; }   // B-99b9: as read, never followed — UNCHECKED (never a folder)
      case 'F': { const d = dir(f[1]); if (d && f[2]) { d.fileCount++; (d.files = d.files || []).push({ name: f[2], size: Number(f[3]) || 0, mtime: (Number(f[4]) || 0) * 1000 }); } break; }
      case 'f': { const d = dir(f[1]); if (d) d.fileCount++; break; }
      case 'Z': { const d = dir(f[1]); if (d) d.more = true; break; }
      case 'P': r.probes.push(f[2] === '1' ? (f[3] === '1' ? { path: f[1], exists: true, isDir: true, git: f[4] === '1', fileCount: f[5] === '' || f[5] == null ? null : Number(f[5]), mtime: (Number(f[6]) || 0) * 1000 } : { path: f[1], exists: true, isDir: false }) : { path: f[1], exists: false }); break;
      case 'I': if (f[1]) r.index.dirs.push(f[1]); break;
      case 'A': if (f[1] && f[2]) r.index.links.push({ from: f[1], to: linkTo(f[1].slice(0, f[1].lastIndexOf('/')) || '/', f[2]), unchecked: true }); break;
      case 'M': if (f[1]) r.mounts.push({ path: f[1], label: f[2] || '' }); break;
      case 'N': if (f[1] && f[2]) r.localized[f[1]] = f[2]; break;
      default: break;
    }
  }
  /* a folder asked for files keeps an empty list (the field knows there are none) */
  for (const d of r.dirs) if (d.exists && !d.files && d.fileCount === 0) d.files = d.files || undefined;
  return r;
}

module.exports = { sliceScript, parseSlice, linkTo, qp, MAX_KIDS, MAX_INDEX };
