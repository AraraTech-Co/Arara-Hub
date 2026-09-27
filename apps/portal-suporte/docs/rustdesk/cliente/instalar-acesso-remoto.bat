@echo off
REM ===========================================================================
REM  Acesso remoto Arara — instalacao em UM arquivo.
REM
REM  O tecnico baixa SO ESTE .bat do portal e roda como Administrador.
REM  Ele mesmo busca o instalador no portal, configura o servidor, sorteia a
REM  senha desta maquina e mostra ID + senha no fim.
REM
REM  Nao precisa de pasta, nem de .toml, nem de mover arquivo: pensado para as
REM  ~700 caixas, onde cada passo manual vira 700 passos manuais.
REM ===========================================================================

setlocal EnableDelayedExpansion

set "PORTAL=https://suporte.arara-tech.com/downloads"
set "TRABALHO=%TEMP%\arara-acesso-remoto"
set "EXE=%TRABALHO%\rustdesk.exe"

if not exist "%TRABALHO%" mkdir "%TRABALHO%" >nul 2>&1

echo.
echo === Baixando o instalador do portal da Arara ===
REM Vem JA CONFIGURADO: servidor e chave viajam no NOME do arquivo (recurso
REM do proprio RustDesk),
REM entao mesmo que algum passo abaixo falhe, o cliente aponta para o nosso
REM servidor. TLS 1.2 explicito porque Windows antigo ainda usa 1.0 por padrao.
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -Uri '%PORTAL%/rustdesk-host=YOUR_DEPLOY_HOST,key=YOUR_RUSTDESK_PUBLIC_KEY.exe' -OutFile '%EXE%' -UseBasicParsing } catch { exit 1 }"

if not exist "%EXE%" (
  echo.
  echo [ERRO] Nao consegui baixar o instalador.
  echo        Confira se esta maquina abre https://suporte.arara-tech.com
  echo        Se a internet do cliente bloqueia downloads, use o instalador
  echo        salvo em pendrive ^(mesmo arquivo, baixado do portal^).
  echo.
  pause & exit /b 1
)

echo.
echo === Instalando ===
"%EXE%" --silent-install
if errorlevel 1 (
  echo [ERRO] Falha ao instalar. Rode este arquivo como Administrador.
  pause & exit /b 1
)

REM Senha de 14 caracteres alfanumericos: simbolo em .bat vira dor de cabeca de
REM escape, e 14 alfanumericos ja dao folga de sobra contra tentativa e erro.
for /f %%S in ('powershell -NoProfile -Command "-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 14 | ForEach-Object {[char]$_})"') do set "SENHA=%%S"

echo.
echo === Definindo a senha desta maquina ===
"%EXE%" --password "!SENHA!"

REM O ID so existe depois que o servico sobe.
timeout /t 6 /nobreak >nul
set "RDID="
for /f %%I in ('"%EXE%" --get-id 2^>nul') do set "RDID=%%I"
if "!RDID!"=="" set "RDID=(abra o RustDesk e anote o ID de 9 digitos)"

REM Deixa por escrito: se o tecnico fechar a janela sem anotar, a senha estaria
REM perdida e a maquina teria que ser reinstalada.
set "FICHA=%USERPROFILE%\Desktop\acesso-remoto-desta-caixa.txt"
> "!FICHA!" echo Acesso remoto - Arara Tech
>>"!FICHA!" echo Maquina.: %COMPUTERNAME%
>>"!FICHA!" echo ID......: !RDID!
>>"!FICHA!" echo Senha...: !SENHA!
>>"!FICHA!" echo.
>>"!FICHA!" echo Cadastre ID e Senha no portal: Clientes ^> Unidades ^> Caixas.

echo.
echo ===========================================================================
echo  PRONTO - anote (tambem salvo na Area de Trabalho):
echo.
echo    ID....: !RDID!
echo    Senha.: !SENHA!
echo.
echo  Cadastre no portal: Clientes ^> Unidades ^> Caixas da unidade.
echo ===========================================================================
echo.
pause
endlocal
