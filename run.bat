@echo off
chcp 65001 >nul
setlocal

echo [1/4] Starting PostgreSQL container...
cd /d D:\DIPLOM
docker compose up -d
if errorlevel 1 (
  echo Failed to start docker services.
  pause
  exit /b 1
)

echo [2/4] Installing backend dependencies if needed...
cd /d D:\DIPLOM\backend
if not exist node_modules (
  call npm install
  if errorlevel 1 (
    echo Backend npm install failed.
    pause
    exit /b 1
  )
)
if not exist .env (
  copy .env.example .env >nul
)

echo [3/4] Installing frontend dependencies if needed...
cd /d D:\DIPLOM\frontend
if not exist node_modules (
  call npm install
  if errorlevel 1 (
    echo Frontend npm install failed.
    pause
    exit /b 1
  )
)
if not exist .env (
  copy .env.example .env >nul
)

echo [4/4] Starting backend and frontend...
start "DIPLOM Backend" cmd /k "cd /d D:\DIPLOM\backend && npx prisma migrate dev --name init && npm run start:dev"
start "DIPLOM Frontend" cmd /k "cd /d D:\DIPLOM\frontend && npm run dev"

echo.
echo Project is starting:
echo - Backend API:  http://localhost:3000/api
echo - Frontend app: http://localhost:5173
echo.
echo Use stop.bat to stop project processes.
pause
