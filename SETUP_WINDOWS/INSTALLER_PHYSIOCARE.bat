@echo off
chcp 65001 >nul
title 🏥 PhysioCare - Installation Windows

echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║           🏥 PHYSIOCARE - INSTALLATION AUTOMATIQUE               ║
echo ║                    Version 1.0.0 - Windows                       ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.

:: Vérifier si Node.js est installé
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js n'est pas installé!
    echo.
    echo 📥 Veuillez télécharger et installer Node.js:
    echo    https://nodejs.org/
    echo.
    echo Appuyez sur une touche pour ouvrir le site...
    pause >nul
    start https://nodejs.org/
    exit /b 1
)

echo ✅ Node.js trouvé: 
node --version
echo.

:: Vérifier si npm est disponible
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm n'est pas disponible!
    exit /b 1
)

echo ✅ npm trouvé:
npm --version
echo.

:: Se déplacer dans le dossier du projet
cd /d "%~dp0.."
echo 📁 Dossier du projet: %cd%
echo.

:: Installer les dépendances
echo ════════════════════════════════════════════════════════════════════
echo 📦 Installation des dépendances npm...
echo ════════════════════════════════════════════════════════════════════
echo.

call npm install

if %errorlevel% neq 0 (
    echo.
    echo ❌ Erreur lors de l'installation des dépendances!
    pause
    exit /b 1
)

echo.
echo ✅ Dépendances installées avec succès!
echo.

:: Lancer l'application
echo ════════════════════════════════════════════════════════════════════
echo 🚀 Lancement de PhysioCare...
echo ════════════════════════════════════════════════════════════════════
echo.

call npm start

pause
