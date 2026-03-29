@echo off
setlocal

cd /d D:\DIPLOM\frontend

if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo Created frontend\.env from .env.example
  )
)

echo Starting frontend...
call npm run dev

pause
