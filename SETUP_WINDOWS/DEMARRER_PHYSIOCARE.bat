@echo off
chcp 65001 >nul
title PhysioCare - Démarrage

cd /d "%~dp0.."
echo 🚀 Lancement de PhysioCare...
call npm start
pause
