# Starts Bionic Passport locally at http://127.0.0.1:8000 (no internet needed).
# First time only:  py -3.12 -m venv .venv ; .\.venv\Scripts\python -m pip install -r requirements.txt
Set-Location -Path $PSScriptRoot
& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
