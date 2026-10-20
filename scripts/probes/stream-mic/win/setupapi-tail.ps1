# setupapi-tail.ps1 - lane stream-mic-wheel-probe (read-only): the setupapi.dev.log lines written since byte offset -From
# (the driver install's own record: package signer, trust, device installs), filtered to the lines that matter.
param([long]$From = 0)
$f = 'C:\Windows\INF\setupapi.dev.log'
$s = [IO.File]::Open($f, 'Open', 'Read', 'ReadWrite'); $null = $s.Seek($From, 'Begin')
$r = New-Object IO.StreamReader($s); $t = $r.ReadToEnd(); $r.Close()
$t -split "`r?`n" | Where-Object { $_ -match '>>>  \[|<<<  \[|Section start|Exit status|signer|Signer|trust|Trust|prompt|Prompt|vbMmeCable|VBAudio|reboot|Reboot|restart|Driver Store|Install Device|Class GUID|!!!|Selected driver' } | Select-Object -First 120 | ForEach-Object { "$_" }
