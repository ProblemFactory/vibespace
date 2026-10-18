# lane.ps1 — the legs' steps on the machine (lane stream-p2w-capture-probe). Each step is one `vibespace-exit run` (≤ 30 s) and
# prints JSON. It opens ONLY its own windows (pad.ps1's text window, an Edge --app window on a data: URL in its OWN profile
# folder, Calculator, the calibration window), records each in lane-<name>.json, and `close` ends exactly those processes.
# NOT Notepad: Windows 11 Notepad restores the owner's previous tabs when it starts (measured: it came up on the owner's
# file), so its frames would carry the owner's data. open-calc refuses when the owner already has Calculator open (a
# single-instance app — a launch would reach the owner's window). PS 5.1-safe.
#   open-edge -Name n [-X -Y -W -H] [-NoOcclusion] [-Light]   (-Light: only the counter strip + a small square change)
#   open-pad [-Name cover] [-Seconds s -X -Y]   (-Name cover: pad.ps1 -Cover, the TopMost cover)   open-calc   open-calib [-Seconds s]   close [-Name n|all]
#   measure -Cmd "<leg>.cmd args" -Seconds s -Tag t  (cmd /c a pushed .cmd in the work dir — pipes live there, never in the
#                                                     run line; samples nvidia-smi + the children's CPU every 500 ms)
#   shot -X -Y -W -H -Out f.png [-Output n]          ONE 8-bit ddagrab frame of that desktop region (the lane window's area)
#   border-shot -Hwnd h -Border 0|1 -Out f.png [-Output n -OX x -OY y]   a live WGC session on the window + that region's
#                                                     shot (OX/OY = the ddagrab output's desktop origin)
param([string]$Step, [string]$Name = 'anim', [int]$X = 100, [int]$Y = 100, [int]$W = 1600, [int]$H = 1000, [switch]$NoOcclusion, [switch]$Light,
  [int]$Seconds = 60, [string]$Cmd = '', [string]$Tag = 'm', [string]$Out = '', [int]$Output = 0, [int]$OX = 0, [int]$OY = 0, [string]$Hwnd = '0', [int]$Border = 1)
$ErrorActionPreference = 'Continue'
$dir = Join-Path $env:USERPROFILE 'vs-probe\p2w'
$exe = Join-Path $dir 'wgc-probe.exe'
$ff = Join-Path $env:USERPROFILE 'vs-probe\ffmpeg\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe'
function Emit($o) { Write-Output ($o | ConvertTo-Json -Depth 6 -Compress) }
function Windows([string]$own) {
  $lines = & $exe list --own $own
  @($lines | Where-Object { $_ -like '{*' } | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.ev -eq 'window' })
}
function Save($n, $o) { Set-Content -Path (Join-Path $dir "lane-$n.json") -Value ($o | ConvertTo-Json -Depth 5 -Compress) }
function WaitWindow([scriptblock]$pick, [int]$ms = 15000) {
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalMilliseconds -lt $ms) { $w = & $pick; if ($w) { return $w }; Start-Sleep -Milliseconds 300 }
  return $null
}
$animHtml = @'
<!doctype html><title>wgc-probe anim</title><style>html,body{margin:0;height:100%;background:#202020;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style><canvas id=c></canvas><script>
const c=document.getElementById('c'),g=c.getContext('2d');let n=0;const d=devicePixelRatio;
function size(){c.width=innerWidth*d;c.height=innerHeight*d}addEventListener('resize',size);size();
function f(){const W=c.width,H=c.height;g.fillStyle='#202020';g.fillRect(0,0,W,H);
for(let i=0;i<8;i++){g.fillStyle='hsl('+((i*45+n*3)%360)+',80%,55%)';g.fillRect((n*9+i*W/8)%W,H*0.25,W/16,H*0.6)}
g.fillStyle='#fff';g.font=Math.round(H/8)+'px monospace';g.fillText('frame '+n,W*0.05,H*0.2);
for(let b=0;b<24;b++){g.fillStyle=(n>>b)&1?'#fff':'#000';g.fillRect(b*24*d,0,24*d,24*d)}
n++;requestAnimationFrame(f)}f();
</script>
'@
if ($Light) { $animHtml = $animHtml.Replace('function f(){const W=c.width,H=c.height;g.fillStyle=', 'function f(){const W=c.width,H=c.height;if(n>0){g.fillStyle="#202020";g.fillRect(W*0.4,H*0.4,W*0.2,H*0.2);g.fillStyle="hsl("+(n*7%360)+",80%,55%)";g.fillRect(W*0.4+(n*13)%(W*0.2-80*d),H*0.45,80*d,80*d);for(let b=0;b<24;b++){g.fillStyle=(n>>b)&1?"#fff":"#000";g.fillRect(b*24*d,0,24*d,24*d)}n++;requestAnimationFrame(f);return}g.fillStyle=') }

switch ($Step) {
  'open-edge' {
    $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
    $udd = Join-Path $dir "edge-$Name"
    $url = 'data:text/html;base64,' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($animHtml))
    $argList = @("--user-data-dir=`"$udd`"", '--no-first-run', '--no-default-browser-check', '--disable-sync', "--window-position=$X,$Y", "--window-size=$W,$H")
    if ($NoOcclusion) { $argList += @('--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows') }
    $argList += "--app=$url"
    $p = Start-Process $edge -ArgumentList $argList -PassThru
    $pids = { @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*edge-$Name*" } | ForEach-Object { $_.ProcessId }) }
    $win = WaitWindow { $own = (& $pids) -join ','; if ($own) { Windows $own | Where-Object { $_.lane -and $_.visible -and $_.title -like 'wgc-probe anim*' } | Select-Object -First 1 } }
    $rec = [ordered]@{ name = $Name; kind = 'edge'; started = $p.Id; pids = @(& $pids); hwnd = $(if ($win) { $win.hwnd } else { $null }); window = $win; noOcclusion = [bool]$NoOcclusion }
    Save $Name $rec; Emit $rec
  }
  'open-pad' {
    $nm = $(if ($Name -eq 'cover') { 'cover' } else { 'pad' }); $al = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $dir 'pad.ps1'), '-Seconds', "$Seconds", '-X', "$X", '-Y', "$Y"); if ($nm -eq 'cover') { $al += '-Cover' }
    $p = Start-Process powershell -ArgumentList $al -WindowStyle Minimized -PassThru
    $win = WaitWindow { Windows "$($p.Id)" | Where-Object { $_.lane -and $_.visible -and $_.title -eq "wgc-probe $nm" } | Select-Object -First 1 }
    $rec = [ordered]@{ name = $nm; kind = 'pad'; started = $p.Id; pids = @($p.Id); hwnd = $(if ($win) { $win.hwnd } else { $null }); window = $win; seconds = $Seconds }
    Save $nm $rec; Emit $rec
  }
  'open-calc' {
    if (Get-Process CalculatorApp -ErrorAction SilentlyContinue) { Emit @{ step = $Step; refused = 'the owner already has Calculator open' }; break }
    $before = @(Windows '' | Where-Object { $_.cls -eq 'ApplicationFrameWindow' } | ForEach-Object { $_.hwnd })
    $p = Start-Process calc.exe -PassThru
    $win = WaitWindow { $afh = @(Get-Process ApplicationFrameHost -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) -join ','; Windows $afh | Where-Object { $_.cls -eq 'ApplicationFrameWindow' -and $_.visible -and $_.cloaked -eq 0 -and $before -notcontains $_.hwnd -and $_.title } | Select-Object -First 1 }
    $app = @(Get-Process CalculatorApp -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $rec = [ordered]@{ name = 'calc'; kind = 'calc'; started = $p.Id; pids = $app; hwnd = $(if ($win) { $win.hwnd } else { $null }); window = $win }
    Save 'calc' $rec; Emit $rec
  }
  'open-calib' {
    $p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $env:USERPROFILE 'vs-probe\calib.ps1'), '-Seconds', "$Seconds") -WindowStyle Minimized -PassThru
    $win = WaitWindow { Windows "$($p.Id)" | Where-Object { $_.lane -and $_.visible -and $_.cls -like 'WindowsForms10.Window*' } | Select-Object -First 1 }
    $rec = [ordered]@{ name = 'calib'; kind = 'calib'; started = $p.Id; pids = @($p.Id); hwnd = $(if ($win) { $win.hwnd } else { $null }); window = $win; seconds = $Seconds }
    Save 'calib' $rec; Emit $rec
  }
  'close' {
    $files = @(Get-ChildItem $dir -Filter 'lane-*.json' | Where-Object { $Name -eq 'all' -or $_.Name -eq "lane-$Name.json" })
    foreach ($f in $files) {
      $r = Get-Content $f.FullName -Raw | ConvertFrom-Json
      $pids = @($r.pids)
      if ($r.kind -eq 'edge') { $pids = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*edge-$($r.name)*" } | ForEach-Object { $_.ProcessId }) }
      foreach ($id in $pids) { $q = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($q -and $r.kind -eq 'pad') { [void]$q.CloseMainWindow() } }
      Start-Sleep -Milliseconds 1500
      $left = @($pids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
      foreach ($id in $left) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
      Remove-Item $f.FullName
      Emit ([ordered]@{ closed = $r.name; kind = $r.kind; pids = $pids; forced = $left })
    }
  }
  'measure' {
    $o = Join-Path $dir "$Tag.out"; $e = Join-Path $dir "$Tag.err"
    $t0 = Get-Date
    $p = Start-Process cmd.exe -ArgumentList ('/d /s /c "' + $Cmd + '"') -NoNewWindow -PassThru -WorkingDirectory $dir -RedirectStandardOutput $o -RedirectStandardError $e
    $null = $p.Handle   # keeps the exit code readable after the process ends
    $gpu = @(); $kids = @{}; $cpu = @{}
    while (-not $p.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt ($Seconds + 8)) {
      if ($kids.Count -lt 2) { Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" | ForEach-Object { $kids[[int]$_.ProcessId] = $_.Name } }
      foreach ($k in @($kids.Keys)) { $q = Get-Process -Id $k -ErrorAction SilentlyContinue; if ($q) { $cpu[$k] = $q.TotalProcessorTime.TotalMilliseconds } }
      $s = & nvidia-smi --query-gpu=utilization.gpu,utilization.encoder,memory.used --format=csv,noheader,nounits 2>$null
      if ($s) { $v = ("$s" -split ',') | ForEach-Object { [double]$_.Trim() }; $gpu += , $v }
      Start-Sleep -Milliseconds 500
    }
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force; foreach ($k in @($kids.Keys)) { Stop-Process -Id $k -Force -ErrorAction SilentlyContinue } }
    $g = @($gpu | ForEach-Object { $_[0] }); $enc = @($gpu | ForEach-Object { $_[1] })
    Emit ([ordered]@{ tag = $Tag; cmd = $Cmd; exit = $p.ExitCode; wallMs = [math]::Round(((Get-Date) - $t0).TotalMilliseconds)
      gpu = [ordered]@{ n = $g.Count; avg = $(if ($g.Count) { [math]::Round(($g | Measure-Object -Average).Average, 1) }); max = $(if ($g.Count) { ($g | Measure-Object -Maximum).Maximum }); encAvg = $(if ($enc.Count) { [math]::Round(($enc | Measure-Object -Average).Average, 1) }); encMax = $(if ($enc.Count) { ($enc | Measure-Object -Maximum).Maximum }) }
      children = @($kids.Keys | ForEach-Object { [ordered]@{ pid = $_; name = $kids[$_]; cpuMsLastSeen = $cpu[$_] } })
      out = @(Get-Content $o -Tail 6 -ErrorAction SilentlyContinue | ForEach-Object { "$_" }); err = @(Get-Content $e -Tail 12 -ErrorAction SilentlyContinue | ForEach-Object { "$_" }) })
  }
  'shot' {
    $grab = "ddagrab=output_idx=${Output}:offset_x=${X}:offset_y=${Y}:video_size=${W}x${H},hwdownload,format=bgra"
    $r = & $ff -hide_banner -loglevel error -y -f lavfi -i $grab -frames:v 1 (Join-Path $dir $Out) 2>&1
    Emit ([ordered]@{ step = 'shot'; out = $Out; exit = $LASTEXITCODE; err = "$r" })
  }
  'border-shot' {
    $wins = @(& $exe list --hwnds $Hwnd | Where-Object { $_ -like '{*' } | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.ev -eq 'window' -and $_.hwnd -eq $Hwnd })
    $fr = $wins[0].frame; $m = 24
    $p = Start-Process $exe -ArgumentList @('grab', '--hwnd', $Hwnd, '--fmt', 'bgra', '--frames', '1', '--border', "$Border", '--hold', '4000') -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $dir "border-$Border.out")
    Start-Sleep -Milliseconds 1800
    $grab = "ddagrab=output_idx=${Output}:offset_x=$($fr[0] - $m - $OX):offset_y=$($fr[1] - $m - $OY):video_size=$($fr[2] - $fr[0] + 2 * $m)x$($fr[3] - $fr[1] + 2 * $m),hwdownload,format=bgra"
    $r = & $ff -hide_banner -loglevel error -y -f lavfi -i $grab -frames:v 1 (Join-Path $dir $Out) 2>&1
    $p.WaitForExit(8000) | Out-Null
    Emit ([ordered]@{ step = 'border-shot'; hwnd = $Hwnd; border = $Border; frame = $fr; margin = $m; grab = $grab; exit = $LASTEXITCODE; err = "$r"; helper = @(Get-Content (Join-Path $dir "border-$Border.out") | ForEach-Object { "$_" }) })
  }
  'min-during' {
    # a capture session on -Hwnd for 8 s; the window is minimized at +2.5 s and restored at +5 s (no activation) — the frames'
    # times (the helper's clock starts with its process) say what WGC delivers while minimized
    # -Name restore: the window is minimized BEFORE the session opens and restored at +2.5 s (the 'min' moment is skipped)
    # -Name move: at +2.5 s the window moves to -X -Y (another display) instead
    $o = Join-Path $dir 'min-during.out'
    if ($Name -eq 'restore') { [void](& $exe show --hwnd $Hwnd --state min) }
    $t0 = Get-Date
    $p = Start-Process $exe -ArgumentList @('grab', '--hwnd', $Hwnd, '--fmt', 'bgra', '--frames', '5000', '--wait', '8000') -NoNewWindow -PassThru -RedirectStandardOutput $o
    Start-Sleep -Milliseconds 2500; $minAt = ((Get-Date) - $t0).TotalMilliseconds; if ($Name -eq 'move') { [void](& $exe place --hwnd $Hwnd --x $X --y $Y --w $W --h $H) } elseif ($Name -ne 'restore') { [void](& $exe show --hwnd $Hwnd --state min); Start-Sleep -Milliseconds 2000 }
    $resAt = ((Get-Date) - $t0).TotalMilliseconds; [void](& $exe show --hwnd $Hwnd --state restore)
    $p.WaitForExit(12000) | Out-Null
    $all = @(Get-Content $o | ForEach-Object { $_ | ConvertFrom-Json }); $fr = @($all | Where-Object { $_.ev -eq 'frame' }); $open = $all | Where-Object { $_.ev -eq 'open' } | Select-Object -First 1
    $bins = [ordered]@{}; foreach ($f in $fr) { $k = [string]([math]::Floor($f.atMs / 500) / 2); if (-not $bins.Contains($k)) { $bins[$k] = [ordered]@{ n = 0; sizes = @(); sums = @() } }; $b = $bins[$k]; $b.n++; $sz = "$($f.contentW)x$($f.contentH)"; if ($b.sizes -notcontains $sz) { $b.sizes += $sz }; if ($b.sums -notcontains $f.sum -and $b.sums.Count -lt 3) { $b.sums += $f.sum } }
    Emit ([ordered]@{ step = 'min-during'; mode = $Name; hwnd = $Hwnd; item = "$($open.itemW)x$($open.itemH)"; resizedFrames = @($fr | Where-Object { $_.poolW -ne $open.itemW } | Select-Object -First 1 | ForEach-Object { "at $($_.atMs) content $($_.contentW)x$($_.contentH) pool $($_.poolW)x$($_.poolH)" }); minAtMs = [math]::Round($minAt); restoreAtMs = [math]::Round($resAt); frames = $fr.Count; perHalfSecond = $bins; tail = @(Get-Content $o -Tail 1 | ForEach-Object { "$_" }) })
  }
  default { Write-Output 'steps: open-edge open-pad open-calc open-calib close measure shot border-shot' }
}
