@echo off
echo 재고 알림 시스템 시작 중...

set CF="C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"

start "백엔드 서버" cmd /k "cd /d %~dp0server && node src/index.js"
timeout /t 2 /nobreak > nul

start "프론트엔드" cmd /k "cd /d %~dp0client && npm run dev -- --host"
timeout /t 2 /nobreak > nul

start "터널-백엔드" cmd /k "%CF% tunnel --url http://localhost:3001"
timeout /t 2 /nobreak > nul

start "터널-프론트" cmd /k "%CF% tunnel --url http://localhost:5173"

echo.
echo 완료! 터널 창에서 trycloudflare.com 주소 확인하세요.
