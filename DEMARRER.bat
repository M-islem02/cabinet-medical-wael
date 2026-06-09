@echo off
chcp 65001 >nul
title PhysioCare - Démarrage
color 0B

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║              PHYSIOCARE - DÉMARRAGE RAPIDE                  ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo Démarrage de l'application...
echo.

npm start

if errorlevel 1 (
    echo.
    echo ❌ Erreur au démarrage. Exécutez d'abord INSTALLER.bat
    pause
)
