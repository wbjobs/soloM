@echo off
echo Starting RAG Backend Server...
cd /d %~dp0

echo Creating data directories...
if not exist "data\documents" mkdir data\documents
if not exist "data\chroma" mkdir data\chroma
if not exist "data\db" mkdir data\db

echo Activating virtual environment...
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo Virtual environment not found, creating one...
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
)

echo Starting server on http://localhost:8000...
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
