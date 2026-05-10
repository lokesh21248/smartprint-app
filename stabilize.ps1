# SmartPrint Project Stabilization Script
# This script helps move the project outside OneDrive and cleans all caches.

$TargetDir = "C:\smartprint-stable"
$CurrentDir = Get-Location

Write-Host "🚀 Starting SmartPrint stabilization..." -ForegroundColor Cyan

# 1. Check if we are in OneDrive
if ($CurrentDir.Path -match "OneDrive") {
    Write-Host "⚠️  Detected project inside OneDrive. This causes filesystem locking and HMR instability." -ForegroundColor Yellow
    Write-Host "📂 Target stable directory: $TargetDir" -ForegroundColor Gray
    
    if (Test-Path $TargetDir) {
        Write-Host "❌ Target directory already exists. Please remove it or choose another path." -ForegroundColor Red
        # exit
    } else {
        Write-Host "📦 Copying project to stable location..." -ForegroundColor Cyan
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
        
        # Copying while excluding heavy/stale folders
        robocopy $CurrentDir $TargetDir /E /XF *.log *.lock /XD .next node_modules .git .vercel
        
        Write-Host "✅ Project copied to $TargetDir" -ForegroundColor Green
        Write-Host "👉 PLEASE OPEN THE PROJECT FROM $TargetDir IN YOUR IDE." -ForegroundColor Green
    }
}

# 2. Cleaning Caches (Current Directory)
Write-Host "🧹 Cleaning caches in current directory..." -ForegroundColor Cyan

$PathsToClean = @(
    ".next",
    "node_modules/.cache",
    "tsconfig.tsbuildinfo"
)

foreach ($Path in $PathsToClean) {
    if (Test-Path $Path) {
        Write-Host "🗑️  Removing $Path..." -ForegroundColor Gray
        Remove-Item -Path $Path -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "✅ Caches cleaned." -ForegroundColor Green

# 3. Instruction for Clean Install
Write-Host ""
Write-Host "🛠️  Next Steps:" -ForegroundColor Cyan
Write-Host "1. Change directory to the stable path: cd $TargetDir" -ForegroundColor White
Write-Host "2. Run: npm install --force" -ForegroundColor White
Write-Host "3. Run: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "✨ Environment is now ready for stable development." -ForegroundColor Green
