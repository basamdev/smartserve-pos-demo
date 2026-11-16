@echo off
cd /d "%~dp0"
echo Demo POS — browser only. Do not use file://
where npx >nul 2>&1 && (
  echo Opening http://localhost:4173
  npx --yes serve -l 4173 .
  goto :eof
)
echo Install Node.js and run: npx serve -l 4173 .
echo Or copy this folder into XAMPP htdocs and open /demo/
pause
