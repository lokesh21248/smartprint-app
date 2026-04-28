@echo off
echo --- SmartPrint Production Push Script ---
cd /d %~dp0

:: Check if git is initialized
if not exist .git (
    echo Initializing Git repository...
    git init
    git branch -M main
)

:: Set remote URL
echo Setting remote origin to https://github.com/lokesh21248/smartprint-production.git...
git remote remove origin 2>nul
git remote add origin https://github.com/lokesh21248/smartprint-production.git

:: Stage and Commit
echo Staging changes...
git add .
echo Committing changes...
git commit -m "feat: production refactor v1 - aligned schema, super-admin, and premium UI"

:: Push (Force push to overwrite initial README if necessary)
echo Pushing to GitHub (main)...
git push -f -u origin main

echo.
echo --- DONE! Your code is now on GitHub ---
echo URL: https://github.com/lokesh21248/smartprint-production
pause
