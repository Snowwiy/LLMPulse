@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cd /d "G:\AI Local\Projects\LLMPulse"
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
echo Exit code: %ERRORLEVEL%
