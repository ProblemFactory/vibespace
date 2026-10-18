# offbox-check.ps1 — lane stream-p2w-capture-probe, OFF-BOX: compile wgc-probe.cs (+ winrt-stubs.cs) with the Roslyn inside a
# portable pwsh 7 at LanguageVersion C# 5 (the in-box csc's language), with and without MINUPDATE. Prints every diagnostic;
# exit 1 on an error. The stubs only stand in for the WinRT types — the real build (build.ps1) is on the machine.
#   pwsh -NoProfile -File offbox-check.ps1 [-Src wgc-probe.cs] [-Stubs winrt-stubs.cs]
param([string]$Src = (Join-Path $PSScriptRoot 'wgc-probe.cs'), [string]$Stubs = (Join-Path $PSScriptRoot 'winrt-stubs.cs'))
Add-Type -Path (Join-Path $PSHOME 'Microsoft.CodeAnalysis.dll')
Add-Type -Path (Join-Path $PSHOME 'Microsoft.CodeAnalysis.CSharp.dll')
$refs = ([AppContext]::GetData('TRUSTED_PLATFORM_ASSEMBLIES') -split [IO.Path]::PathSeparator) | Where-Object { $_ -match '[\\/](System\.|netstandard|mscorlib|Microsoft\.Win32)' } | ForEach-Object { [Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($_) }
$bad = 0
foreach ($defs in @(@(), @('MINUPDATE'))) {
  $po = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::new([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::CSharp5, [Microsoft.CodeAnalysis.DocumentationMode]::None, [Microsoft.CodeAnalysis.SourceCodeKind]::Regular, [string[]]$defs)
  $trees = @([Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([IO.File]::ReadAllText($Src), $po, $Src), [Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([IO.File]::ReadAllText($Stubs), $po, $Stubs))
  $co = [Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions]::new([Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication)
  $comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create('wgc', [Microsoft.CodeAnalysis.SyntaxTree[]]$trees, [Microsoft.CodeAnalysis.MetadataReference[]]$refs, $co)
  $ms = [IO.MemoryStream]::new(); $r = $comp.Emit($ms)
  $diags = $r.Diagnostics | Where-Object { $_.Severity -ge [Microsoft.CodeAnalysis.DiagnosticSeverity]::Warning -and $_.Id -notin @('CS0067','CS0169','CS0649') }
  foreach ($d in $diags) { Write-Output ("[{0}] {1}" -f ($defs -join ','), $d.ToString()) }
  Write-Output ("[{0}] emit {1}, {2} errors" -f ($defs -join ','), $r.Success, @($r.Diagnostics | Where-Object { $_.Severity -eq 'Error' }).Count)
  if (-not $r.Success) { $bad++ }
}
exit $bad
