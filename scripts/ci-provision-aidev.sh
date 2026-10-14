#!/bin/bash
# ci-provision-aidev.sh — the SYSTEM layer of the self-hosted DESKTOP batch box (lane ci-aidev-desktop-batch, design q-038
# step ①; the owner 2026-10-14: 「你就用 aidev 跑吧」). It installs what the heavy tier's self-hosted half (ci.mjs `host:`
# desktop + binary — the suites that run xpra / Xvfb / x11vnc / LibreOffice or a real binary) needs, the way the hub has
# it; the user layer (node, agent-browser, codex, the repo clone) stays scripts/ci-remote-provision.sh's. Run ON the box:
#   ssh aidev 'bash -s' < scripts/ci-provision-aidev.sh          (then ci-remote-provision.sh, as ci-remote.mjs says)
# IDEMPOTENT: every step prints FOUND (nothing done) or INSTALLED / PINNED / SET, with its seconds. sudo for apt and for the
# ONE sysctl the design names (B-4260: Ubuntu 24.04's AppArmor userns restriction denies bwrap's uid map) — nothing else.
# PROGRAMS is the census row set: every program a self-hosted suite names (ci.mjs HOST_PROGRAMS) is a row here — the
# package that provides it, or `none:<why>` (test-ci-gate §8c holds the two together, with a control).
set -u
CI_ROOT=${CI_ROOT:-/var/tmp/vibespace-ci}
XPRA_VERSION=${XPRA_VERSION:-6.5.4-r0-1}
mkdir -p "$CI_ROOT"/dl "$CI_ROOT"/logs || exit 1
step() { STEP=$1; T0=$(date +%s.%N); }
done_() { printf '[provision] %-22s %-9s %5.1fs  %s\n' "$STEP" "$1" "$(echo "$(date +%s.%N) - $T0" | bc)" "${2:-}"; }
fail() { printf '[provision] %-22s FAILED   %s\n' "$STEP" "$1"; exit 1; }
apt_() { sudo -n env DEBIAN_FRONTEND=noninteractive apt-get "$@" > "$CI_ROOT/logs/apt-$STEP.log" 2>&1; }
# program → package | npm:<pkg> | none — and why (one row per line): the self-hosted set's programs, then what its suites drive
PROGRAMS='xpra xpra
Xvfb xvfb
x11vnc x11vnc
Xvnc tigervnc-standalone-server
Xtigervnc tigervnc-standalone-server
libreoffice libreoffice-writer
soffice libreoffice-writer
bwrap bubblewrap
unshare util-linux
rclone rclone
fusermount3 fuse3
codex npm:@openai/codex the hub version, first on the run PATH (scripts/ci-remote-provision.sh)
claude none hub parity: the hub heavy PATH has no claude, its real-binary legs SKIP with evidence on both boxes (no vendor calls)
opencode none hub parity: the hub heavy PATH has no opencode, the suites drive a stub serve or SKIP with evidence
helm none hub parity: the hub heavy PATH has no helm, test-helm-render SKIPs with evidence on both boxes
gnome-calculator gnome-calculator
xterm xterm
xdotool xdotool
xauth xauth
wish tk
xrdb x11-xserver-utils
xclip xclip
xprop x11-utils
xwininfo x11-utils
zenity zenity
dtach dtach
dbus-run-session dbus-daemon'
# 1. apt — the heavy tier's set (scripts/ci-remote-provision.sh APT_PKGS) + the desktop batch's: the hub's fonts (its
# default sans is Noto Sans — fonts-noto-core; a box without it measures every chrome line in DejaVu), every locale
# (suites run zh_CN / en_US), tk (wish), GTK 3's gi bindings (scripts/fixtures/two-windows.py)
APT_PKGS="dtach xvfb x11vnc tigervnc-standalone-server tigervnc-tools xauth xterm xdotool wmctrl dbus-x11 dbus-daemon at-spi2-core
 gir1.2-atspi-2.0 python3-gi python3-dbus libsecret-tools gnome-keyring libnotify-bin fonts-dejavu-core fonts-liberation fonts-noto-cjk
 fonts-noto-color-emoji ffmpeg espeak-ng imagemagick ghostscript poppler-utils libreoffice-writer zenity gnome-calculator xclip rclone
 fuse3 bubblewrap flatpak novnc websockify x11-utils x11-xserver-utils jq rsync bc
 fonts-noto-core fonts-dejavu fonts-dejavu-extra fonts-ubuntu fonts-terminus-otb fonts-tuffy locales-all tk gir1.2-gtk-3.0 bindfs strace"
step apt
missing=$(dpkg-query -W -f='${Package} ${Status}\n' $APT_PKGS 2>/dev/null | awk '$4=="installed"{print $1}' | sort > "$CI_ROOT/dl/have.txt"; for p in $APT_PKGS; do grep -qx "$p" "$CI_ROOT/dl/have.txt" || echo "$p"; done | tr '\n' ' ')
if [ -z "${missing// }" ]; then done_ FOUND "all $(echo $APT_PKGS | wc -w) packages"
else
  sudo -n true 2>/dev/null || fail "no passwordless sudo (missing: $missing)"
  apt_ update -qq || fail "apt-get update (see $CI_ROOT/logs/apt-$STEP.log)"
  apt_ install -y -qq $missing || fail "apt-get install (see $CI_ROOT/logs/apt-$STEP.log)"
  done_ INSTALLED "$missing"
fi
# 2. xpra PINNED to the hub's build (6.5.4 — xpra.org's noble repo keeps it) and held: the suites carry measured rows per
# xpra build (a link whose packet beats its threaded hello answer is dropped on 6.5.4 — test-desktop-xpra-window §12)
step xpra
have=$(dpkg-query -W -f='${Version}' xpra 2>/dev/null)
pkgs=$(dpkg-query -W -f='${Package} ${Status}\n' 'xpra*' 2>/dev/null | awk '$4=="installed" && $1!="xpra-html5"{print $1}' | tr '\n' ' ')
if [ "$have" = "$XPRA_VERSION" ] && [ -z "$(for p in $pkgs; do [ "$(dpkg-query -W -f='${Version}' "$p")" = "$XPRA_VERSION" ] || echo "$p"; done)" ]; then
  sudo -n apt-mark hold ${pkgs:-xpra} > /dev/null 2>&1; done_ FOUND "xpra $have (held: ${pkgs})"
else
  sudo -n apt-mark unhold ${pkgs:-xpra} > /dev/null 2>&1
  apt_ install -y -qq --allow-downgrades $(for p in ${pkgs:-xpra}; do echo "$p=$XPRA_VERSION"; done) || fail "xpra $XPRA_VERSION (see $CI_ROOT/logs/apt-$STEP.log)"
  sudo -n apt-mark hold ${pkgs:-xpra} > /dev/null
  done_ PINNED "xpra $(dpkg-query -W -f='${Version}' xpra) (was ${have:-none}; held: ${pkgs:-xpra})"
fi
# 3. THE ONE SYSCTL (B-4260): Ubuntu 24.04 restricts unprivileged user namespaces through AppArmor — bwrap's uid map is
# denied ("setting up uid map: Permission denied", test-node-bootstrap). The hub (26.04) lets them; persisted, so a reboot keeps it.
step userns
conf=/etc/sysctl.d/60-vibespace-ci-userns.conf
cur=$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null)
if [ -z "$cur" ]; then done_ FOUND "kernel.apparmor_restrict_unprivileged_userns does not exist on this kernel"
elif [ "$cur" = 0 ] && [ -f "$conf" ]; then done_ FOUND "kernel.apparmor_restrict_unprivileged_userns = 0 ($conf)"
else
  echo 'kernel.apparmor_restrict_unprivileged_userns = 0' | sudo -n tee "$conf" > /dev/null || fail "write $conf"
  sudo -n sysctl -q -p "$conf" || fail "sysctl -p $conf"
  done_ SET "kernel.apparmor_restrict_unprivileged_userns $cur → $(sysctl -n kernel.apparmor_restrict_unprivileged_userns) ($conf)"
fi
# 4. the programs census: each row's program on PATH (an npm / none row says where it comes from instead)
step programs
miss=$(while read -r p how why; do case "$how" in none|npm:*) continue;; esac; command -v "$p" > /dev/null || printf ' %s' "$p"; done <<< "$PROGRAMS")
python3 -c 'import gi; gi.require_version("Atspi", "2.0"); gi.require_version("Gtk", "3.0")' 2>/dev/null || miss="$miss python3-gi(Atspi/Gtk 3)"
[ -z "$miss" ] && done_ FOUND "$(echo "$PROGRAMS" | wc -l) rows on PATH or named" || fail "not on PATH after the install:$miss"
# 5. THE GTK ROW (B-4260): what this box's desktop stack draws the suites' calculator as — measured, never assumed. GNOME
# Calculator alone on a private Xvfb + session bus: the GTK 4 build, the calculator's version, its WM_NORMAL_HINTS
# minimum at 1× (the suites' 2× / 3× floors are multiples of its height: 616 on the hub, 502 here at 4.14), and the
# name AT-SPI gives a push button ("button" from at-spi2-core 2.60, "push button" before — the suites' tree walks
# match it). The row goes to $CI_ROOT/gtk-row.json and is printed for scripts/fixtures/gtk-rows.json (keyed by the GTK
# major.minor); ci-remote.mjs --batch refuses a box whose row the tree does not carry, or carries differently.
step gtk-row
gtk=$(dpkg-query -W -f='${Version}' libgtk-4-1 2>/dev/null | sed 's/+.*//')
calc=$(dpkg-query -W -f='${Version}' gnome-calculator 2>/dev/null | sed 's/^[0-9]*://; s/-.*//')
atspi=$(dpkg-query -W -f='${Version}' at-spi2-core 2>/dev/null | sed 's/-.*//')
row=$(GTK=$gtk CALC=$calc ATSPI=$atspi python3 - <<'PY' 2>"$CI_ROOT/logs/gtk-row.log"
import json, os, re, shutil, subprocess, tempfile, time
import gi; gi.require_version('Atspi', '2.0'); from gi.repository import Atspi
tmp = tempfile.mkdtemp(prefix='vs-gtkrow-'); os.chmod(tmp, 0o700)
r, w = os.pipe()
xvfb = subprocess.Popen(['Xvfb', '-displayfd', str(w), '-screen', '0', '1600x1200x24', '-nolisten', 'tcp'], pass_fds=(w,), stderr=subprocess.DEVNULL)
os.close(w); disp = ':' + os.read(r, 16).decode().strip(); os.close(r)
env = {'PATH': os.environ['PATH'], 'HOME': tmp, 'XDG_RUNTIME_DIR': tmp, 'DISPLAY': disp, 'GDK_BACKEND': 'x11', 'LANG': 'C.UTF-8'}
app = subprocess.Popen(['dbus-run-session', '--', 'gnome-calculator'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
# the hint SETTLES after the first layout (measured here: 514 at the first read, 502 a second later) — read until
# the same minimum holds for 2 s (4 reads), within 30 s
seen = []
for _ in range(60):
  time.sleep(0.5)
  ids = subprocess.run(['xdotool', 'search', '--onlyvisible', '--class', 'calculator'], env=env, capture_output=True, text=True).stdout.split()
  h = subprocess.run(['xprop', '-id', ids[-1], 'WM_NORMAL_HINTS'], env=env, capture_output=True, text=True).stdout if ids else ''
  mm = re.search(r'minimum size: (\d+) by (\d+)', h)
  seen.append(mm.group(0) if mm else None)
  if mm and len(seen) >= 4 and len(set(seen[-4:])) == 1: break
hints = seen[-1] or '' if seen else ''
os.killpg(app.pid, 15); app.wait(timeout=10); xvfb.terminate(); xvfb.wait(timeout=10); shutil.rmtree(tmp, ignore_errors=True)
m = re.search(r'minimum size: (\d+) by (\d+)', hints)
print(json.dumps({'gtk': os.environ['GTK'], 'calculator': os.environ['CALC'], 'atspi': os.environ['ATSPI'],
  'calcMin1x': [int(m.group(1)), int(m.group(2))] if m else None, 'pushButtonRole': Atspi.role_get_name(Atspi.Role.PUSH_BUTTON)}))
PY
)
if echo "$row" | grep -q '"calcMin1x": \['; then echo "$row" > "$CI_ROOT/gtk-row.json"; done_ MEASURED "$row"
else fail "could not measure the calculator (see $CI_ROOT/logs/gtk-row.log): $row"; fi
echo "[provision] desktop batch box ready: $(. /etc/os-release; echo "$PRETTY_NAME") · xpra $(dpkg-query -W -f='${Version}' xpra) · GTK $gtk · gnome-calculator $calc · userns $(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo n/a) · sans $(fc-match -f '%{family}' sans-serif)"
