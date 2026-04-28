@echo off
echo --- SmartPrint Vercel Deploy Script ---
cd /d %~dp0
vercel --prod
echo --- Done! ---
pause
