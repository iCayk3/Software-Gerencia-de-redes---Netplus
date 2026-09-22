@echo off
chcp 65001 > nul
title NetPulse - Ambiente de Desenvolvimento em Casa (100%% Node.js)
color 0b

echo ===============================================================================
echo     NetPulse - Gerenciador BGP & OSPF (Modo Desenvolvedor / Casa)
echo ===============================================================================
echo.
echo [1/3] Verificando instalação do Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [ERRO] Node.js não foi encontrado nesta máquina!
    echo Por favor, instale o Node.js em: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   -^> Node.js detectado: %NODE_VER% (OK)

echo.
echo [2/3] Iniciando Servidor Mock da API (Porta 8080)...
echo   -^> Não requer Go instalado.
echo   -^> Lê e grava os dados reais em backend\data\ (devices.json, as_metadata.json).
start "NetPulse - API Mock Server (Porta 8080)" cmd /c "node mock-server.cjs"

timeout /t 2 /nobreak > nul

echo.
echo [3/3] Verificando dependências do Frontend React...
cd frontend
if not exist "node_modules\" (
    echo   -^> Primeira execução detectada! Instalando dependências (npm install)...
    call npm install
)

echo.
echo ===============================================================================
echo   -^> Iniciando Vite Dev Server (Porta 5173)...
echo   -^> Abrindo seu navegador em http://localhost:5173
echo ===============================================================================
echo.
start "NetPulse - Frontend React Vite (Porta 5173)" cmd /c "npm run dev"

timeout /t 3 /nobreak > nul
start http://localhost:5173

echo.
echo [OK] Tudo pronto! Ambas as janelas (API Mock e Frontend) estão em execução.
echo Para encerrar, basta fechar as janelas do terminal.
echo.
pause
