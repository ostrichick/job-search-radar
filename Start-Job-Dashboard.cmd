@echo off
cd /d "%~dp0"
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:4317'"
npm start
