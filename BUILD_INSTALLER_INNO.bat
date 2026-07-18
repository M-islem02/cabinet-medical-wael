@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"

if not exist "%ISCC%" (
  echo ERREUR: Inno Setup 6 est introuvable.
  echo Installez Inno Setup 6 puis relancez ce script.
  exit /b 1
)

echo [1/3] Installation des dependances...
call npm install
if errorlevel 1 exit /b 1

echo [2/3] Construction de l'application Windows...
call npx electron-builder --win dir --x64
if errorlevel 1 exit /b 1

echo [3/3] Compilation de l'installateur Inno Setup...
"%ISCC%" installer-inno.iss
if errorlevel 1 exit /b 1

echo.
echo Installateur genere dans dist\inno
exit /b 0
