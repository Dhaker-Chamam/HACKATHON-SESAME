@echo off
rem Double-click to start Bionic Passport locally (no internet needed).
cd /d "%~dp0"
start "" http://127.0.0.1:8000/
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
