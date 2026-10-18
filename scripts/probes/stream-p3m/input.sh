#!/bin/sh
# leg 4: CGEventPostToPid into the probe's OWN TextEdit document while Chrome is frontmost, into the probe's OWN Chrome
# window (a data: URL that writes its input into document.title) while TextEdit is frontmost, the calibration window's
# receiver as the control, then CGEventPost(.cghidEventTap) with TextEdit frontmost (guarded: unlocked + frontmost check)
cd ~/vs-probe/p3m
T=$PWD/p3m-tcc; X=$PWD/p3m-aux
TE=$(pgrep -nx TextEdit); C=$(awk '/^calib pid/ {print $3; exit}' calib.log); CH=$(pgrep -x "Google Chrome" | head -1)
fr() { $X facts >/dev/null; osa=$(lsappinfo front 2>/dev/null); echo "frontmost: $(lsappinfo info -only name $osa 2>/dev/null | tr -d '\n')"; }
echo "TextEdit $TE · calib $C · Chrome $CH"
URL='data:text/html,<title>vs-p3m-probe</title><body style="background:%23223;color:%23fff;font:24px sans-serif">vs-p3m probe: typed text goes to the title<br><input id=i autofocus style="font-size:32px" oninput="document.title=%27vs-p3m-probe:%27+this.value"><script>setTimeout(()=>window.close(),900000)</script>'
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --new-window "$URL" >/dev/null 2>&1 &
sleep 3; fr
$T $X axtitles $CH | grep -E "AX windows|vs-p3m"
echo "== A. CGEventPostToPid → TextEdit (Chrome frontmost)"
$T $X pid $TE "pid-to-textedit "
sleep 0.5; fr; $T $X axtext $TE | grep "text area"
echo "== B. CGEventPostToPid → calib receiver (control)"
$T $X pid $C "abc"; sleep 0.5; grep RECV calib.log | tail -3
echo "== C. CGEventPostToPid → Chrome (TextEdit frontmost)"
open -a TextEdit; sleep 1; fr
$T $X pid $CH "pid-to-chrome"; sleep 1; fr; $T $X axtitles $CH | grep vs-p3m
echo "== D. CGEventPost(.cghidEventTap) with TextEdit frontmost"
$T $X hid $TE "hid-to-textedit "; sleep 0.5; $T $X axtext $TE | grep "text area"
echo "== E. the same HID post from a plain agentd child (no p3m-tcc ⇒ node, no Accessibility)"
$X hid $TE "hid-as-node "; sleep 0.5; $T $X axtext $TE | grep "text area"
