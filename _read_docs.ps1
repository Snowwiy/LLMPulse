$files = @('G:\AI Local\Projects\LLMPulse\src-tauri\Cargo.toml',
           'G:\AI Local\Projects\LLMPulse\src-tauri\tauri.conf.json',
           'G:\AI Local\Projects\LLMPulse\README.md',
           'G:\AI Local\Projects\LLMPulse\LICENSE')
foreach ($f in $files) {
    Write-Host "=== $f ==="
    Get-Content $f -Raw | Out-String -Width 200
}
