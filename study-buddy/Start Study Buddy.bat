@echo off
title Study Buddy AI - Launcher

echo.
echo ========================================
echo          STUDY BUDDY AI
echo ========================================
echo.

echo [1/3] Checking MySQL...
echo.

REM Check whether MySQL is already running
sc query MySQL80 | find "RUNNING" >nul

if %errorlevel%==0 (
    echo [OK] MySQL is already running.
) else (
    echo [INFO] Starting MySQL...
    net start MySQL80
)

echo.
echo [2/3] Starting Python ML Service...
echo.

start "Study Buddy - ML Service" cmd /k "cd /d ""%~dp0ml_service"" && python -m uvicorn main:app --reload --port 8000"

timeout /t 5 /nobreak >nul

echo.
echo [3/3] Starting Node.js Server...
echo.

start "Study Buddy - Node Server" cmd /k "cd /d ""%~dp0"" && node server.js"

timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo       STUDY BUDDY IS READY!
echo ========================================
echo.

start "" "http://localhost:3000"

echo Application opened in your browser.
echo.
echo Keep this launcher/server windows open
echo while using Study Buddy.
echo.
pause