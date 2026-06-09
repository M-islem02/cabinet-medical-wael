@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

echo ============================================================
echo         INSTALLATION AUTOMATIQUE MARIADB (WINDOWS)
echo ============================================================
echo.
echo Ce script doit etre execute en tant qu'Administrateur.
echo.

:: Check admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERREUR] Lancez ce script en mode Administrateur.
  pause
  exit /b 1
)

set "MARIADB_VERSION=11.8.1"
set "MARIADB_URL=https://archive.mariadb.org/mariadb-%MARIADB_VERSION%/winx64-packages/mariadb-%MARIADB_VERSION%-winx64.msi"
set "MSI_FILE=%TEMP%\mariadb-%MARIADB_VERSION%-winx64.msi"

echo [1/4] Verification de winget...
where winget >nul 2>&1
if %errorlevel%==0 (
  echo [2/4] Installation via winget (MariaDB.Server)...
  winget install --id MariaDB.Server --exact --accept-package-agreements --accept-source-agreements --silent
  if %errorlevel%==0 (
    echo.
    echo [OK] MariaDB installe via winget.
    goto :POST_INSTALL
  )
  echo [INFO] winget a echoue, bascule vers telechargement MSI...
) else (
  echo [INFO] winget non disponible, bascule vers telechargement MSI...
)

echo [2/4] Telechargement MSI officiel MariaDB %MARIADB_VERSION%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%MARIADB_URL%' -OutFile '%MSI_FILE%' -UseBasicParsing; exit 0 } catch { exit 1 }"
if %errorlevel% neq 0 (
  echo [ERREUR] Impossible de telecharger automatiquement MariaDB.
  echo Ouvrez ce lien puis installez manuellement:
  echo https://mariadb.org/download/
  start "" "https://mariadb.org/download/"
  pause
  exit /b 1
)

echo [3/4] Installation silencieuse du MSI...
msiexec /i "%MSI_FILE%" /qn /norestart
if %errorlevel% neq 0 (
  echo [ERREUR] L'installation MSI a echoue (code %errorlevel%).
  echo Lancez manuellement le fichier: %MSI_FILE%
  pause
  exit /b %errorlevel%
)

:POST_INSTALL
echo [4/4] Verification service MariaDB...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Service | Where-Object { $_.Name -match 'MariaDB|MySQL' -or $_.DisplayName -match 'MariaDB|MySQL' } | Select-Object Name,DisplayName,Status | Format-Table -AutoSize"

echo.
echo [OK] Installation MariaDB terminee.
echo Prochaine etape: executer SCRIPT_SQL_COMPLET.sql dans HeidiSQL.
echo.
pause
exit /b 0
