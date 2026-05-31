@echo off
echo ========================================
echo    RAG Knowledge Base Assistant
echo ========================================
echo.

echo Starting Backend Server (Terminal 1)...
start "RAG Backend" cmd /k "cd backend && start.bat"

echo Waiting for backend to start...
timeout /t 5 /nobreak >nul

echo Starting Frontend Server (Terminal 2)...
start "RAG Frontend" cmd /k "frontend-start.bat"

echo.
echo ========================================
echo    Services Starting...
echo ========================================
echo.
echo Backend API:  http://localhost:8000
echo Backend Docs: http://localhost:8000/docs
echo Frontend:     http://localhost:3000
echo.
echo Press any key to exit this window...
pause >nul
