@echo off
chcp 65001 > nul
title NetPulse - Execução com Binário Go Compilado (api.exe)
color 0a

echo ===============================================================================
echo     NetPulse - Gerenciador BGP & OSPF (Modo Executável Nativo Windows)
echo ===============================================================================
echo.
echo [1/3] Verificando binário compilado backend\bin\api.exe...
if not exist "backend\bin\api.exe" (
    color 0c
    echo [ERRO] O arquivo backend\bin\api.exe não foi encontrado!
    echo Use o script iniciar_em_casa.bat para rodar com Node.js puro sem precisar de Go.
    pause
    exit /b 1
)
echo   -^> Binário api.exe encontrado! Não requer Go instalado nesta máquina.

echo.
echo [2/3] Iniciando Backend API Go (Porta 8080)...
start "NetPulse - Backend Go (Porta 8080)" cmd /c "cd backend && .\bin\api.exe"

timeout /t 2 /nobreak > nul

echo.
echo [3/3] Iniciando Frontend React...
cd frontend
if not exist "node_modules\" (
    echo   -^> Instalando dependências (npm install)...
    call npm install
)

start "NetPulse - Frontend React Vite (Porta 5173)" cmd /c "npm run dev"

timeout /t 3 /nobreak > nul
start http://localhost:5173

echo.
echo [OK] Backend e Frontend iniciados com sucesso!
echo.
pause
