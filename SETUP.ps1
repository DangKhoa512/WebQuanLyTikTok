# =========================================
# SCRIPT CHAY DU AN - chay sau khi cai Node.js + MySQL
# =========================================

Write-Host "=== BUOC 1: Cai Backend ===" -ForegroundColor Cyan
Set-Location "c:\Users\KHOA\Desktop\QUANLY_REG\backend"
npm install

Write-Host ""
Write-Host "=== BUOC 2: Cai Frontend ===" -ForegroundColor Cyan
Set-Location "c:\Users\KHOA\Desktop\QUANLY_REG\frontend"
npm install

Write-Host ""
Write-Host "=== BUOC 3: Seed du lieu mau ===" -ForegroundColor Cyan
Set-Location "c:\Users\KHOA\Desktop\QUANLY_REG\backend"
node seeds/seedData.js

Write-Host ""
Write-Host "=== XONG! ===" -ForegroundColor Green
Write-Host "Chay backend: cd backend; npm run dev" -ForegroundColor Yellow
Write-Host "Chay frontend: cd frontend; npm run dev" -ForegroundColor Yellow
