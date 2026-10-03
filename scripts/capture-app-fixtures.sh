#!/bin/sh
# Captures the REAL apt / dpkg / .desktop shapes scripts/test-app-manifest.mjs parses
# (lane custom-app, docs/design-app-persistence.zh.md §3.1). NOT a test: run by hand to
# refresh scripts/fixtures/apt/ — every file is the verbatim output of the command that
# writes it below. Two machines: THIS box (an Ubuntu release — simulations only,
# `apt-get -s` / `--print-uris` need no root and change nothing) and a throwaway
# Debian 12 container (node:22-bookworm-slim — the fleet image's base) where the
# real installs (hello, xterm) happen as the container's root, never on this box.
# Usage: sh scripts/capture-app-fixtures.sh   (needs docker for the Debian half)
set -eu
D=$(cd "$(dirname "$0")" && pwd)/fixtures/apt
mkdir -p "$D"
export LC_ALL=C
sim() { apt-get -s install "$@" 2>&1 || true; }
uris() { apt-get --print-uris -y install "$@" 2>&1 || true; }
# ── this box (Ubuntu): simulations only ──
sim hello > "$D/ubuntu-hello.sim.txt"; uris hello > "$D/ubuntu-hello.uris.txt"
sim gimp > "$D/ubuntu-gimp.sim.txt"; uris gimp > "$D/ubuntu-gimp.uris.txt"
sim no-such-package-vs > "$D/ubuntu-missing.sim.txt"
# a snap transitional package simulated against an EMPTY dpkg status (this box has snapd installed, so its own
# simulation would never list it — the empty status is the one invented input: apt and its lists are real)
E=$(mktemp -d); : > "$E/status"
apt-get -s -o Dir::State::status="$E/status" install chromium-browser > "$D/ubuntu-snap.sim.txt" 2>&1 || true
rm -rf "$E"
apt-get -s upgrade > "$D/ubuntu-upgrade.sim.txt" 2>&1 || true
for f in debian-xterm.desktop google-chrome.desktop libreoffice-math.desktop btop.desktop feh.desktop; do
  [ -r "/usr/share/applications/$f" ] && cp "/usr/share/applications/$f" "$D/desktop-$f"
done
# ── a throwaway Debian 12 container ──
docker run --rm -v "$D:/out" node:22-bookworm-slim sh -c '
set -eu; export LC_ALL=C DEBIAN_FRONTEND=noninteractive
useradd -m u; mkdir -m 777 /tmp/o
su u -s /bin/sh -c "
cd /tmp
set -eu; export LC_ALL=C
L=\$HOME/.cache/vs-apt; mkdir -p \$L/lists/partial \$L/cache/archives/partial
A=\"-o Dir::State::Lists=\$L/lists -o Dir::Cache=\$L/cache\"
apt-get \$A -o Debug::NoLocking=1 update > /dev/null 2>&1 || true
apt-get \$A -s install hello > /tmp/o/debian-hello.sim.txt 2>&1 || true
apt-get \$A --print-uris -y install hello > /tmp/o/debian-hello.uris.txt 2>&1 || true
apt-get \$A -s install gimp > /tmp/o/debian-gimp.sim.txt 2>&1 || true
apt-get \$A --print-uris -y install gimp > /tmp/o/debian-gimp.uris.txt 2>&1 || true
apt-get \$A -s install exim4-daemon-light exim4-daemon-heavy > /tmp/o/debian-conflict.sim.txt 2>&1 || true
cd /tmp && apt-get \$A download hello > /dev/null 2>&1
dpkg-deb -I /tmp/hello_*.deb > /tmp/o/debian-deb.info.txt 2>&1
dpkg-deb -f /tmp/hello_*.deb > /tmp/o/debian-deb.control.txt 2>&1
apt-get \$A -s install /tmp/hello_*.deb > /tmp/o/debian-deb.sim.txt 2>&1 || true
"
apt-get update > /dev/null 2>&1
Q() { dpkg-query -W -f="\${Package}\t\${Version}\t\${Architecture}\t\${Status}\n"; }
Q > /out/debian-dpkg-before.txt
apt-get install -y --no-install-recommends xterm > /dev/null 2>&1
Q > /out/debian-dpkg-after.txt
cp /usr/share/applications/debian-xterm.desktop /out/desktop-debian-xterm-bookworm.desktop
apt-get -s remove --autoremove xterm > /out/debian-remove.sim.txt 2>&1 || true
apt-get -s install --only-upgrade xterm hello > /out/debian-only-upgrade.sim.txt 2>&1 || true
cp /tmp/o/* /out/ && chown -R '"$(id -u):$(id -g)"' /out
'
# public repo hygiene: no person's name in a fixture — the maintainer field and the files' license headers go
sed -i 's/^\( *Maintainer: \).*/\1Example Maintainer <maintainer@example.invalid>/' "$D"/debian-deb.info.txt "$D"/debian-deb.control.txt
for f in "$D"/desktop-*.desktop; do awk 'BEGIN{h=1} h && /^#/ {next} h && /^[[:space:]]*$/ {next} {if(h){print "# (the installed file'"'"'s license header is not kept here)"; h=0} print}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"; done
echo "captured into $D"
# ── the dpkg set of a fresh Debian 12 root filesystem: the status file, the root script's `q` lines and their sha256
#    (the base identity — test-app-manifest checks the PURE reader against all three) ──
docker run --rm -v "$D:/out" node:22-bookworm-slim sh -c '
set -eu; export LC_ALL=C
cp /var/lib/dpkg/status /out/debian-dpkg-status.txt
dpkg-query -W -f="\${db:Status-Abbrev} \${Package}:\${Architecture} \${Version}\n" | awk "\$1 == \"ii\" { print \$2 \" \" \$3 }" | sort -u > /out/debian-q.txt
sha256sum < /out/debian-q.txt | cut -d" " -f1 > /out/debian-q.sha256
chown '"$(id -u):$(id -g)"' /out/debian-dpkg-status.txt /out/debian-q.txt /out/debian-q.sha256'
# public repo hygiene: the status file names each package's maintainer — replaced like the .deb fields above
sed -i 's/^\(Maintainer: \).*/\1Example Maintainer <maintainer@example.invalid>/; s/^\(Original-Maintainer: \).*/\1Example Maintainer <maintainer@example.invalid>/' "$D/debian-dpkg-status.txt"
# ── the ROOT SCRIPT itself (src/app-manifest.js APP_SCRIPT) in two throwaway containers sharing one HOME: an install
#    (hello + xterm, online), then the same HOME on a FRESH root filesystem with no network — the offline replay ──
H=$(mktemp -d); mkdir -p "$H/.vibespace/apps"
node -e "process.stdout.write(require('$D/../../../src/app-manifest.js').APP_SCRIPT)" > "$H/app.sh"
docker run --rm -v "$H:/home/u" node:22-bookworm-slim sh -c 'apt-get update > /dev/null 2>&1; sh /home/u/app.sh /home/u/.vibespace/apps install hello abcdef123 -- hello xterm > /home/u/install.log 2>&1 || true'
docker run --rm --network none -v "$H:/home/u" node:22-bookworm-slim sh -c 'sh /home/u/app.sh /home/u/.vibespace/apps replay replay1 noncereplay1 > /home/u/replay.log 2>&1 || true'
cp "$H/install.log" "$D/debian-run-install.log"; cp "$H/replay.log" "$D/debian-run-replay.log"
docker run --rm -v "$H:/h" node:22-bookworm-slim rm -rf /h/.vibespace /h/install.log /h/replay.log /h/app.sh
rm -rf "$H"
echo "captured the run logs into $D"
# ── two PUBLIC archive signing keys of this box, binary and armored, with gpg's own fingerprints (the OpenPGP reader
#    in src/app-serve.js is checked against them: three v4 primaries; a primary + a subkey) ──
G=$(mktemp -d); chmod 700 "$G"
base64 -w 76 /usr/share/keyrings/ubuntu-archive-keyring.gpg > "$D/key-ubuntu-archive.gpg.b64"   # binary bytes as text (no tracked NUL)
GNUPGHOME="$G" gpg -q --import /usr/share/keyrings/githubcli-archive-keyring.gpg
GNUPGHOME="$G" gpg --armor --export > "$D/key-githubcli.asc"
GNUPGHOME="$G" gpgconf --kill all 2>/dev/null || true; rm -rf "$G"
gpg --show-keys --with-colons /usr/share/keyrings/ubuntu-archive-keyring.gpg 2>/dev/null | awk -F: '$1 == "fpr" { print $10 }' > "$D/key-ubuntu-archive.b64.fpr"
gpg --show-keys --with-colons "$D/key-githubcli.asc" 2>/dev/null | awk -F: '$1 == "fpr" { print $10 }' > "$D/key-githubcli.asc.fpr"
