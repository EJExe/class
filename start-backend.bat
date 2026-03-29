@echo off
setlocal

cd /d D:\DIPLOM\backend

if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo Created backend\.env from .env.example
  )
)

echo Starting backend...
call npm run start:dev

pause
