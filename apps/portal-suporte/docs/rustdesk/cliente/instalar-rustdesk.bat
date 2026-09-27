@echo off
REM ===========================================================================
REM  Instalador RustDesk pre-configurado para as caixas dos clientes (Arara).
REM  Aponta o cliente para o servidor self-hosted da Arara e define uma senha
REM  permanente UNICA POR MAQUINA (acesso nao-assistido).
REM
REM  Rode como ADMINISTRADOR.
REM
REM  PRE-REQUISITOS (na mesma pasta deste .bat):
REM    - rustdesk.exe        (instalador oficial: https://rustdesk.com/download)
REM    - RustDesk2.toml      (config com servidor + chave - JA PREENCHIDO)
REM
REM  NAO edite nada aqui: a senha e sorteada nesta maquina e mostrada no fim,
REM  junto do ID. Senha por caixa (decisao de 21/08/2026): se uma vazar, as
REM  outras continuam protegidas.
REM ===========================================================================

setlocal EnableDelayedExpansion

set "AQUI=%~dp0"
set "RUSTDESK=%AQUI%rustdesk.exe"
set "TOML=%AQUI%RustDesk2.toml"

REM O instalador oficial vem com nome versionado (rustdesk-1.4.2-x86_64.exe).
REM Exigir o nome exato "rustdesk.exe" fazia todo tecnico ter que renomear - e
REM esquecer disso era o erro mais comum. Aqui aceitamos qualquer rustdesk*.exe.
if not exist "%RUSTDESK%" (
  for %%F in ("%AQUI%rustdesk*.exe") do (
    if not defined ACHADO set "ACHADO=%%~fF"
  )
  if defined ACHADO set "RUSTDESK=!ACHADO!"
)

if not exist "!RUSTDESK!" (
  echo.
  echo [ERRO] Nao achei o instalador do RustDesk nesta pasta:
  echo        %AQUI%
  echo.
  echo  O que fazer:
  echo    1^) Baixe o instalador Windows 64-bit em https://rustdesk.com/download
  echo    2^) Mova o arquivo baixado ^(ex.: rustdesk-1.4.2-x86_64.exe^) para ESTA pasta
  echo    3^) Rode este .bat de novo, como Administrador
  echo.
  echo  Arquivos que estao aqui agora:
  dir /b "%AQUI%"
  echo.
  pause & exit /b 1
)

echo Instalador encontrado: !RUSTDESK!
if not exist "%TOML%" (
  echo [ERRO] RustDesk2.toml nao esta nesta pasta. Sem ele a caixa aponta para o
  echo        servidor publico da RustDesk e o suporte nao acha o ID.
  pause & exit /b 1
)

echo.
echo === Instalando RustDesk (silencioso) ===
"!RUSTDESK!" --silent-install
if errorlevel 1 (
  echo [ERRO] Falha ao instalar. Rode como Administrador e confira o rustdesk.exe.
  pause & exit /b 1
)

echo.
echo === Aplicando configuracao do servidor Arara ===
"!RUSTDESK!" --import-config "%TOML%"

REM Senha de 14 caracteres sem simbolos: simbolo em .bat vira dor de cabeca de
REM escape, e 14 alfanumericos ja dao folga de sobra contra tentativa e erro.
for /f %%S in ('powershell -NoProfile -Command "-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 14 | ForEach-Object {[char]$_})"') do set "SENHA=%%S"

if "!SENHA!"=="" (
  echo [ERRO] Nao consegui sortear a senha (PowerShell indisponivel).
  echo        Defina manualmente no app: Configuracoes ^> Seguranca ^> Senha permanente.
  pause & exit /b 1
)

echo.
echo === Definindo senha permanente desta maquina ===
"!RUSTDESK!" --password "!SENHA!"

REM O ID so existe depois que o servico sobe; damos um tempo antes de perguntar.
timeout /t 5 /nobreak >nul
set "RDID="
for /f %%I in ('"!RUSTDESK!" --get-id 2^>nul') do set "RDID=%%I"
if "!RDID!"=="" set "RDID=(abra o RustDesk e anote o ID de 9 digitos)"

REM Deixa o resultado por escrito: o tecnico fecha o terminal sem querer e a
REM senha estaria perdida - teria que reinstalar.
set "FICHA=%USERPROFILE%\Desktop\rustdesk-desta-caixa.txt"
> "!FICHA!" echo RustDesk - Arara Tech
>>"!FICHA!" echo Maquina.: %COMPUTERNAME%
>>"!FICHA!" echo ID......: !RDID!
>>"!FICHA!" echo Senha...: !SENHA!
>>"!FICHA!" echo Servidor: YOUR_DEPLOY_HOST
>>"!FICHA!" echo.
>>"!FICHA!" echo Cadastre ID e Senha no portal: Clientes ^> Unidades ^> Caixas.

echo.
echo ===========================================================================
echo  PRONTO - anote estes dados (tambem salvos na Area de Trabalho):
echo.
echo    ID....: !RDID!
echo    Senha.: !SENHA!
echo.
echo  Cadastre no portal: Clientes ^> Unidades ^> Caixas da unidade.
echo  Cada caixa tem a SUA senha - nao reaproveite entre maquinas.
echo ===========================================================================
echo.
pause
endlocal
