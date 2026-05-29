@echo off
echo ========================================
echo    TikTok Manager - Khoi dong he thong
echo ========================================

echo [1/2] Khoi dong Backend...
start "BACKEND - port 3000" cmd /k "cd /d C:\Users\KHOA\Desktop\QUANLY_REG\backend && node src\server.js"

timeout /t 3 /nobreak >nul

echo [2/2] Khoi dong Frontend...
start "FRONTEND - port 5173" cmd /k "cd /d C:\Users\KHOA\Desktop\QUANLY_REG\frontend && npm run dev"

echo.
echo ========================================
echo  Backend  : http://localhost:3000
echo  Frontend : http://localhost:5173
echo  Dashboard: http://localhost:5173
echo ========================================
echo.
echo Nhan phim bat ky de dong cua so nay...
pause >nul
