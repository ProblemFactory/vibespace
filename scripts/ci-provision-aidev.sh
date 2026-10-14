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
# (suites run zh_CN / en_US), tk (wish), GTK 3's gi bindings (scripts/fixtures/two-windows.py), python3-docx
# (test-office-desktop builds its .docx fixture with it — it SKIPPED on the box without)
APT_PKGS="dtach xvfb x11vnc tigervnc-standalone-server tigervnc-tools xauth xterm xdotool wmctrl dbus-x11 dbus-daemon at-spi2-core
 gir1.2-atspi-2.0 python3-gi python3-dbus libsecret-tools gnome-keyring libnotify-bin fonts-dejavu-core fonts-liberation fonts-noto-cjk
 fonts-noto-color-emoji ffmpeg espeak-ng imagemagick ghostscript poppler-utils libreoffice-writer zenity gnome-calculator xclip rclone
 fuse3 bubblewrap flatpak novnc websockify x11-utils x11-xserver-utils jq rsync bc
 fonts-noto-core fonts-dejavu fonts-dejavu-extra fonts-ubuntu fonts-terminus-otb fonts-tuffy locales-all tk gir1.2-gtk-3.0 bindfs strace
 python3-docx"
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
# 5. THE GTK ROW (B-4260): what this box's desktop stack draws the suites' GNOME Calculator as — measured INSIDE a private
# xpra server exactly as the suites run it (GDK_SCALE=2, Xft.dpi 96; no client attached), never assumed: the window's
# size at 2×, its WM_NORMAL_HINTS minimum when first announced and once it holds 2 s (calculator 46 / GTK 4.14 announces
# 694×1004, then 694×980; 50 / 4.22 holds 720×1232), whether that minimum is BUTTON-bound (unchanged at 1× under
# Xft.dpi 144 — 50 is; 46 grows 346×492 → 380×518), and the role AT-SPI names a push button ("button" from
# at-spi2-core 2.60, "push button" before). The row goes to $CI_ROOT/gtk-row.json and is printed for
# scripts/fixtures/gtk-rows.json (keyed by the GTK 4 major.minor); ci-remote.mjs --batch refuses a box whose measured
# row the tree does not carry, or carries differently. Every process of a measurement is ended by its private
# XDG_RUNTIME_DIR (a bus-activated portal outlives its session otherwise) and its FUSE mount unmounted.
step gtk-row
gtk=$(dpkg-query -W -f='${Version}' libgtk-4-1 2>/dev/null | sed 's/+.*//')
calc=$(dpkg-query -W -f='${Version}' gnome-calculator 2>/dev/null | sed 's/^[0-9]*://; s/-.*//')
atspi=$(dpkg-query -W -f='${Version}' at-spi2-core 2>/dev/null | sed 's/-.*//')
row=$(GTK=$gtk CALC=$calc ATSPI=$atspi python3 - <<'PY' 2>"$CI_ROOT/logs/gtk-row.log"
import json, os, random, re, shutil, signal, subprocess, tempfile, time
import gi; gi.require_version('Atspi', '2.0'); from gi.repository import Atspi
def end_all(tmp):
  for _ in range(3):
    for p in os.listdir('/proc'):
      if not p.isdigit(): continue
      try:
        if f'XDG_RUNTIME_DIR={tmp}'.encode() in open(f'/proc/{p}/environ', 'rb').read().split(b'\0'): os.kill(int(p), signal.SIGTERM)
      except Exception: pass
    time.sleep(0.5)
  subprocess.run(['fusermount3', '-u', os.path.join(tmp, 'doc')], stderr=subprocess.DEVNULL)
  shutil.rmtree(tmp, ignore_errors=True)
def measure(scale, dpi):
  tmp = tempfile.mkdtemp(prefix='vs-gtkrow-'); os.chmod(tmp, 0o700)
  disp = f':{random.randint(30000, 39999)}'
  env = {'PATH': os.environ['PATH'], 'HOME': tmp, 'XDG_RUNTIME_DIR': tmp, 'LANG': 'C.UTF-8'}
  child = f"sh -c 'echo Xft.dpi: {dpi} | xrdb -merge; exec env GDK_SCALE={scale} GDK_BACKEND=x11 dbus-run-session -- gnome-calculator'"
  xp = subprocess.Popen(['xpra', 'start', disp, '--daemon=no', '--mdns=no', '--pulseaudio=no', '--notifications=no', '--webcam=no', '--printing=no',
    '--file-transfer=no', '--systemd-run=no', f'--bind={tmp}/sock', f'--start-child={child}', '--exit-with-children=yes'],
    env=env, stdout=open(os.path.join(tmp, 'xpra.log'), 'w'), stderr=subprocess.STDOUT, start_new_session=True)
  denv = {**env, 'DISPLAY': disp}
  first = size = None; seen = []; t0 = time.time()
  while time.time() - t0 < 30:
    time.sleep(0.2)
    ids = subprocess.run(['xdotool', 'search', '--class', 'gnome-calculator'], env=denv, capture_output=True, text=True).stdout.split()
    if not ids: continue
    m = re.search(r'minimum size: (\d+) by (\d+)', subprocess.run(['xprop', '-id', ids[-1], 'WM_NORMAL_HINTS'], env=denv, capture_output=True, text=True).stdout)
    g = re.findall(r'(?:Width|Height): (\d+)', subprocess.run(['xwininfo', '-id', ids[-1]], env=denv, capture_output=True, text=True).stdout)
    if not m or len(g) != 2 or int(g[0]) < 10: continue
    cur = [int(m.group(1)), int(m.group(2))]
    if first is None: first, size = cur, [int(g[0]), int(g[1])]
    seen.append(cur)
    if len(seen) >= 10 and all(x == cur for x in seen[-10:]): break
  try: os.killpg(xp.pid, signal.SIGTERM)
  except Exception: pass
  end_all(tmp)
  return {'size': size, 'first': first, 'settled': seen[-1] if seen else None}
two = measure(2, 96); one96 = measure(1, 96); one144 = measure(1, 144)
print(json.dumps({'gtk': os.environ['GTK'], 'calculator': os.environ['CALC'], 'atspi': os.environ['ATSPI'],
  'calcSize2x': two['size'], 'calcMinFirst2x': two['first'], 'calcMin2x': two['settled'],
  'calcButtonBound': bool(one96['settled'] and one96['settled'] == one144['settled']), 'calcMin1x': one96['settled'], 'calcMin1xDpi144': one144['settled'],
  'pushButtonRole': Atspi.role_get_name(Atspi.Role.PUSH_BUTTON)}))
PY
)
if echo "$row" | grep -q '"calcMin2x": \['; then echo "$row" > "$CI_ROOT/gtk-row.json"; done_ MEASURED "$row"
else fail "could not measure the calculator inside xpra (see $CI_ROOT/logs/gtk-row.log): $row"; fi
echo "[provision] desktop batch box ready: $(. /etc/os-release; echo "$PRETTY_NAME") · xpra $(dpkg-query -W -f='${Version}' xpra) · GTK $gtk · gnome-calculator $calc · userns $(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo n/a) · sans $(fc-match -f '%{family}' sans-serif)"
