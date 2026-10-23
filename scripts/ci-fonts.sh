#!/usr/bin/env bash
# scripts/ci-fonts.sh [--system] — the Actions mirror's ONE fonts road (lane ci-cjk-fonts, 2.369.346).
# The chrome suites measure zh / ja text as users see it, in Noto Sans CJK (and Noto Serif CJK: a mail frame sets no font,
# so a zh / ja mail is drawn in the default serif). They came from `apt install fonts-noto-cjk` — 3–6 s on a shard the
# azure mirror served, 11–21 min on one it did not (2026-10-23: 4 of 6 shards, the 61 MB .deb crawling from the fallback
# archive), and the 2.369.345 master mirror was cancelled for it. This road fetches the SAME bytes: the four TTCs of the
# noto-cjk tree at tag Serif2.002 — the snapshot Debian's 1:20230817+repack1 (the runner's noble) repacks; every sha256
# below equals that .deb's file. Each is verified before it is installed (a mismatch is a red naming the file), curl is
# bounded (5 retries, 15 s to connect, 120 s a try), and ci.yml's actions/cache keeps the dir (keyed on this file), so a
# hit is a sha256 check. NO apt fallback: a second road hides the first one's failure. --system (the runner) makes the
# dir EVERY HOME's, as apt's fonts were: the suites' servers run under scratch HOMEs, and a ~/.local/share/fonts dir is
# only its own HOME's — so a fontconfig <dir> in /etc/fonts/conf.d and the system cache (sudo). test-ci-gate §2h holds
# ci.yml to this road and runs this file over a fixture (CI_FONTS_BASE / CI_FONTS_DIR / CI_FONTS_CONF / CI_FONTS_SUDO).
set -euo pipefail
TAG=Serif2.002
BASE=${CI_FONTS_BASE:-https://raw.githubusercontent.com/notofonts/noto-cjk/$TAG}
PINS=(
  'b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a Sans/OTC/NotoSansCJK-Regular.ttc'
  'faa5f3656a78b2e2d450d27fe8382c778bc2b6bb5ea29c986664a6a435056ceb Sans/OTC/NotoSansCJK-Bold.ttc'
  '93069d8e9e45d515cc421c971a79e6a5777704b348e36a9ef86578bf58adef77 Serif/OTC/NotoSerifCJK-Regular.ttc'
  '9d3c0d769c703cfe41c49cbe2b14d4718e26545593dc247485486335b783fe94 Serif/OTC/NotoSerifCJK-Bold.ttc'
)
dir=${CI_FONTS_DIR:-$HOME/.local/share/fonts/noto-cjk}
SUDO=${CI_FONTS_SUDO-sudo}
system=
if [ "${1:-}" = --system ]; then system=1; shift; fi
[ "$#" -eq 0 ] || { echo "usage: ci-fonts.sh [--system]" >&2; exit 2; }
red() { echo "::error::ci-fonts: $*" >&2; exit 1; }
t0=$SECONDS
mkdir -p "$dir"
for pin in "${PINS[@]}"; do
  want=${pin%% *} rel=${pin#* }
  name=$(basename "$rel") f=$dir/$(basename "$rel")
  if [ -f "$f" ]; then
    [ "$(sha256sum "$f" | cut -d' ' -f1)" = "$want" ] && { echo "ci-fonts: cached $name (sha256 ok)"; continue; }
    echo "::warning::ci-fonts: the cached $name is not the pinned file — fetching it again"
  fi
  curl -fsSL --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 15 --max-time 120 -o "$f.part" "$BASE/$rel" \
    || { code=$?; rm -f "$f.part"; echo "::error::ci-fonts: $name — curl exit $code after 5 retries ($BASE/$rel)" >&2; exit "$code"; }
  got=$(sha256sum "$f.part" | cut -d' ' -f1)
  [ "$got" = "$want" ] || { rm -f "$f.part"; red "$name sha256 $got, pinned $want ($TAG, $BASE/$rel) — not installed"; }
  mv -f "$f.part" "$f"
  echo "ci-fonts: fetched $name ($(stat -c %s "$f") bytes, sha256 ok)"
done
if [ -n "$system" ]; then
  conf=${CI_FONTS_CONF:-/etc/fonts/conf.d/09-vibespace-noto-cjk.conf}
  printf '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n<fontconfig>\n  <dir>%s</dir>\n</fontconfig>\n' "$dir" | $SUDO tee "$conf" >/dev/null
  echo "ci-fonts: $conf names $dir for every HOME"
  $SUDO fc-cache -f "$dir"
else
  fc-cache -f "$dir"
fi
# the proof: fontconfig sees the family, and what a zh / ja page's sans-serif resolves to
n=$(fc-list | grep -F "$dir/" | grep -c 'Noto Sans CJK' || true)
[ "$n" -ge 1 ] || red "fc-list sees no Noto Sans CJK in $dir after fc-cache"
echo "ci-fonts: fc-list | grep -c 'Noto Sans CJK' = $n faces in $dir"
echo "ci-fonts: families: $(fc-list --format '%{file}|%{family[0]}\n' | grep -F "$dir/" | cut -d'|' -f2 | sort -u | paste -sd, - | sed 's/,/, /g')"
for l in zh-cn ja; do echo "ci-fonts: sans-serif:lang=$l → $(fc-match "sans-serif:lang=$l" family file)"; done
if [ -n "$system" ]; then
  other=$(mktemp -d)
  m=$(env HOME="$other" XDG_CACHE_HOME="$other/.cache" XDG_DATA_HOME="$other/.local/share" fc-list | grep -F "$dir/" | grep -c 'Noto Sans CJK' || true)
  rm -rf "$other"
  [ "$m" -ge 1 ] || red "a process under another HOME sees no Noto Sans CJK — $dir is not every HOME's"
  echo "ci-fonts: under a scratch HOME too: $m faces"
fi
echo "ci-fonts: done in $((SECONDS - t0)) s ($TAG)"
