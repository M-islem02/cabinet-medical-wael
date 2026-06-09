@echo off
chcp 65001 >nul
title PhysioCare - Installation
color 0A

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║           PHYSIOCARE - INSTALLATION AUTOMATIQUE             ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Vérifier Node.js
echo [1/3] Vérification de Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ❌ Node.js n'est pas installé!
    echo.
    echo Veuillez installer Node.js depuis: https://nodejs.org/
    echo Choisissez la version LTS (Long Term Support)
    echo.
    pause
    start https://nodejs.org/
    exit /b 1
)
echo ✅ Node.js trouvé

:: Installer les dépendances
echo.
echo [2/3] Installation des dépendances npm...
echo (Cela peut prendre quelques minutes...)
echo.
call npm install
if errorlevel 1 (
    echo.
    echo ❌ Erreur lors de l'installation des dépendances
    pause
    exit /b 1
)
echo.
echo ✅ Dépendances installées

:: Lancer l'application
echo.
echo [3/3] Lancement de PhysioCare...
echo.
echo ═══════════════════════════════════════════════════════════════
echo   PhysioCare va démarrer dans une nouvelle fenêtre
echo   
echo   Identifiants Super Admin:
echo   👤 Utilisateur: superadmin
echo   🔑 Mot de passe: MedPro@2024!
echo ═══════════════════════════════════════════════════════════════
echo.

start cmd /k "npm start"

echo.
echo Installation terminée! L'application démarre...
echo.
timeout /t 5
