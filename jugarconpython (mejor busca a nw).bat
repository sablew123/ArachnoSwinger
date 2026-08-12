@echo off
setlocal

rem ---------------------------------------------------------------
rem  jugar.bat -- levanta un servidor local en esta misma carpeta
rem  y abre spiderswing.html en el navegador, para no tener que
rem  escribir los comandos a mano cada vez.
rem  Poné este archivo en la MISMA carpeta que spiderswing.html
rem  (junto a habilities/, physics/, entities/, etc.) y hacele
rem  doble click.
rem ---------------------------------------------------------------

cd /d "%~dp0"

if not exist "index.html" (
    echo No encuentro index.html en esta carpeta.
    echo Asegurate de que jugar.bat este junto al juego.
    pause
    exit /b 1
)

set PORT=8000

rem --- buscar cual comando de python anda: "python" o "py" ---
set PYCMD=
python --version >nul 2>&1
if %errorlevel%==0 (
    set PYCMD=python
) else (
    py --version >nul 2>&1
    if %errorlevel%==0 (
        set PYCMD=py
    )
)

if "%PYCMD%"=="" (
    echo No encontre Python instalado ni como "python" ni como "py".
    echo Instalalo desde https://python.org/downloads/
    echo IMPORTANTE: durante la instalacion, tildá "Add Python to PATH".
    pause
    exit /b 1
)

echo Usando "%PYCMD%" para levantar el servidor en el puerto %PORT%...
echo.
echo No cierres esta ventana mientras jugas.
echo Para cortar el servidor: cerra esta ventana o apreta Ctrl+C.
echo.

rem --- abrir el navegador un par de segundos despues, para darle
rem     tiempo al servidor a levantar antes de pedirle la pagina ---
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORT%/index.html"

rem --- levantar el servidor (esto se queda corriendo en esta ventana) ---
%PYCMD% -m http.server %PORT%

pause
