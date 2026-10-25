@echo off
setlocal enabledelayedexpansion
title Bionic Passport

cd /d "%~dp0"

echo ========================================================
echo   Bionic Passport: Medical Decision Support for Space
echo ========================================================
echo.

rem Check if port 8000 is already in use by a previous instance
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
  echo [Info] Port 8000 is occupied by process PID %%a.
  echo [Info] Releasing port 8000 so the fresh server can start...
  taskkill /F /PID %%a >nul 2>&1
  timeout /t 1 /nobreak >nul
)

rem Find Python executable
set "PY_EXE="
if exist ".venv\Scripts\python.exe" (
  set "PY_EXE=.venv\Scripts\python.exe"
) else (
  echo [Warning] .venv not found. Checking system Python...
  where py >nul 2>&1
  if !errorlevel! equ 0 (
    echo [Info] Initializing virtual environment with py -3.12...
    py -3.12 -m venv .venv 2>nul || py -3 -m venv .venv
  ) else (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
      echo [Info] Initializing virtual environment with python...
      python -m venv .venv
    )
  )
  if exist ".venv\Scripts\python.exe" (
    set "PY_EXE=.venv\Scripts\python.exe"
    echo [Info] Installing requirements...
    "!PY_EXE!" -m pip install -r requirements.txt
  )
)

if not defined PY_EXE (
  echo.
  echo [Error] Python executable was not found.
  echo Please install Python 3.12 from https://python.org or Microsoft Store.
  echo.
  pause
  exit /b 1
)

echo.
echo [1/2] Opening browser at http://127.0.0.1:8000 ...
start "" http://127.0.0.1:8000/

echo [2/2] Starting local FastAPI server on http://127.0.0.1:8000 ...
echo Press Ctrl+C to stop the server at any time.
echo.

"%PY_EXE%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000

if errorlevel 1 (
  echo.
  echo [Error] Server exited with an error code.
  echo.
  pause
)
