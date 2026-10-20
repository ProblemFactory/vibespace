#!/bin/sh
# mic-install-mac.sh — VibeSpace lane stream-mic-wheel-probe (probe). Runs ONLY after the owner said yes: installing a HAL
# plug-in is the owner's act, asked through macOS's own administrator password dialog on this Mac's screen (AppleScript
# `do shell script … with administrator privileges` — the twin of the Windows UAC starter). The elevated shell:
#   ours       copies ~/vs-probe/mic/VibeSpaceMic.driver into /Library/Audio/Plug-Ins/HAL, makes it root's, checks the
#              INSTALLED binary's SHA-256 against the pin (root-owned by then: nothing of the user's can swap it after the
#              check), then restarts coreaudiod (every app's sound stops for a second or two)
#   blackhole  checks the vendor pkg's SHA-256 + its notarized Developer ID, then `installer -pkg` (its postinstall restarts
#              coreaudiod itself)
#   remove-ours / remove-blackhole   the uninstall doors (the same dialog)
# Run detached (the password dialog outlives the 30 s run cap); the result lands in install-<what>.json.
#   nohup sh mic-install-mac.sh ours > install-out.txt 2>&1 &
cd "$HOME/vs-probe/mic" || exit 1
what="$1"
OURS_SHA=7f0125609cb4f0cf0379d5e927b1a328039bd2fd83dbc896df9752520809132a
BH_SHA=57b540f27a3e29c37e310e01bee0fdfab76733087e47f997ef9dccf851400dcf
HAL=/Library/Audio/Plug-Ins/HAL
RESTART="launchctl kickstart -kp system/com.apple.audio.coreaudiod || killall coreaudiod"
case "$what" in
  ours)
    cmd="rm -rf $HAL/VibeSpaceMic.driver && cp -R '$HOME/vs-probe/mic/VibeSpaceMic.driver' $HAL/ && chown -R root:wheel $HAL/VibeSpaceMic.driver && [ \"\$(shasum -a 256 $HAL/VibeSpaceMic.driver/Contents/MacOS/VibeSpaceMic | cut -d' ' -f1)\" = $OURS_SHA ] || { rm -rf $HAL/VibeSpaceMic.driver; echo 'the installed copy is not the checked build - removed'; exit 3; }; $RESTART"
    prompt="VibeSpace 想安装测试用的虚拟麦克风「VibeSpace Microphone」。Core Audio 会重启一次，所有声音停 1–2 秒。" ;;
  blackhole)
    [ "$(shasum -a 256 BlackHole2ch-0.7.1.pkg | cut -d' ' -f1)" = "$BH_SHA" ] || { echo '{"ok":false,"error":"the BlackHole pkg is not the checked download"}' > install-$what.json; exit 1; }
    pkgutil --check-signature BlackHole2ch-0.7.1.pkg | grep -q 'Existential Audio Inc. (Q5C99V536K)' || { echo '{"ok":false,"error":"the BlackHole pkg is not signed by Existential Audio"}' > install-$what.json; exit 1; }
    cmd="installer -pkg '$HOME/vs-probe/mic/BlackHole2ch-0.7.1.pkg' -target /"
    prompt="VibeSpace 想安装 BlackHole 2ch（Existential Audio 的虚拟声卡，测试虚拟麦克风用）。Core Audio 会重启一次，所有声音停 1–2 秒。" ;;
  remove-ours)
    cmd="rm -rf $HAL/VibeSpaceMic.driver && $RESTART"
    prompt="VibeSpace 想移除测试用的虚拟麦克风「VibeSpace Microphone」。Core Audio 会重启一次。" ;;
  remove-blackhole)
    cmd="rm -rf $HAL/BlackHole2ch.driver && pkgutil --forget audio.existential.BlackHole2ch; $RESTART"
    prompt="VibeSpace 想移除 BlackHole 2ch。Core Audio 会重启一次。" ;;
  *) echo "usage: mic-install-mac.sh ours|blackhole|remove-ours|remove-blackhole"; exit 2 ;;
esac
t0=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || date +%s000)
out=$(osascript - "$cmd" "$prompt" <<'APPLESCRIPT' 2>&1
on run argv
  do shell script (item 1 of argv) with administrator privileges with prompt (item 2 of argv)
end run
APPLESCRIPT
)
rc=$?
t1=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || date +%s000)
esc=$(printf '%s' "$out" | tr '\n"\\' '   ' | cut -c1-300)
echo "{\"ok\":$([ $rc = 0 ] && echo true || echo false),\"what\":\"$what\",\"rc\":$rc,\"ms\":$((t1 - t0)),\"out\":\"$esc\"}" > "install-$what.json"
