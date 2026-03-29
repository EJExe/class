@echo off
setlocal

cd /d D:\DIPLOM

echo Starting Docker services...
docker compose up -d

if errorlevel 1 (
  echo Failed to start Docker services.
  pause
  exit /b 1
)

echo.
echo PostgreSQL is running.
echo Port: 5433
pause
