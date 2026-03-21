@echo off
chcp 65001 >nul
setlocal

echo Stopping frontend/backend Node processes...
taskkill /FI "WINDOWTITLE eq DIPLOM Backend*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq DIPLOM Frontend*" /T /F >nul 2>nul
taskkill /IM node.exe /F >nul 2>nul

echo Stopping docker services...
cd /d D:\DIPLOM
docker compose down

echo Done.
pause
