# pad.ps1 — the lane's own Notepad-class window (lane stream-p2w-capture-probe): a plain WinForms (GDI, DPI-unaware) window
# "wgc-probe pad" with a multi-line text box and a label that ticks every 50 ms (so a capture tells a live picture from the
# last frame). It stands in for Notepad: Windows 11 Notepad restores the owner's previous tabs when it starts, so a capture
# of it would carry the owner's files. Shows in the taskbar; closes itself after -Seconds.
# -Cover: instead an opaque TopMost "wgc-probe cover" window (no text box, no ticks) — the occlusion leg's cover: a process in
# the background cannot raise another window over a newer one (measured: SetWindowPos HWND_TOP / HWND_BOTTOM and a
# minimize + restore without activation all left the z-order as it was), a TopMost window sits above every normal one.
param([int]$Seconds = 120, [int]$X = 300, [int]$Y = 200, [switch]$Cover)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$f = New-Object System.Windows.Forms.Form
$f.Text = 'wgc-probe pad'; $f.StartPosition = 'Manual'; $f.Location = New-Object System.Drawing.Point($X, $Y); $f.Size = New-Object System.Drawing.Size(800, 520)
$l = New-Object System.Windows.Forms.Label
$l.Dock = 'Top'; $l.Height = 48; $l.Font = New-Object System.Drawing.Font('Consolas', 20); $l.BackColor = [System.Drawing.Color]::FromArgb(32, 32, 32); $l.ForeColor = [System.Drawing.Color]::White
$t = New-Object System.Windows.Forms.TextBox
$t.Multiline = $true; $t.Dock = 'Fill'; $t.Font = New-Object System.Drawing.Font('Consolas', 14)
$t.Text = (1..20 | ForEach-Object { "line $_ - the lane's own text window for the Windows.Graphics.Capture probe" }) -join "`r`n"
$f.Controls.Add($t); $f.Controls.Add($l)
if ($Cover) { $f.Text = 'wgc-probe cover'; $f.TopMost = $true; $f.Controls.Clear(); $f.BackColor = [System.Drawing.Color]::FromArgb(40, 90, 160) }
$n = 0
$tick = New-Object System.Windows.Forms.Timer; $tick.Interval = 50
$tick.Add_Tick({ $script:n++; $l.Text = 'tick ' + $script:n })
$end = New-Object System.Windows.Forms.Timer; $end.Interval = $Seconds * 1000
$end.Add_Tick({ $f.Close() })
$tick.Start(); $end.Start()
[void]$f.ShowDialog()
