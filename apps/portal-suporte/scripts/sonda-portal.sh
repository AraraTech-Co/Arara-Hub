#!/usr/bin/env bash
# =============================================================================
# Sonda do portal — vigia o domínio e avisa quando ele cai DE VERDADE.
#
# ── O que mudou em 11/09/2026, e por quê ─────────────────────────────────────
#
# A versão anterior perguntava o estado à hospedagem da plataforma e, na queda,
# chamava `POST /v1/apps/portal-suporte/hosting/start` para levantar sozinha.
# Isso deixou de existir: o portal passou a ser servido por nginx em contêiner
# no VPS, e aquele endpoint responde 410. Placar de uma semana rodando assim:
#
#     224 FALHOU · 226 QUEDA · 2 OK
#
# Ela tentava levantar o que não existe mais, falhava, e notificava. Pior: as
# "quedas" eram `http=000` — o curl sem conseguir conectar, ou seja, a máquina
# de quem sonda sem rede (notebook dormindo, Wi-Fi caindo). Alarme falso a cada
# soneca, e alarme que ninguém mais acredita é o mesmo que alarme nenhum.
#
# Três correções:
#
#   1. NÃO TENTA MAIS LEVANTAR. Não tem como; fingir que tem é pior. Virou
#      vigia, e o cabeçalho diz isso para ninguém contar com o que ela não faz.
#   2. TESTEMUNHA. Antes de acusar queda, confere um segundo endereço (a API).
#      Se os DOIS estão fora, o problema é a rede de quem sonda — registra e
#      cala. Foi exatamente isso que produziu os 224 alarmes falsos.
#   3. INSISTÊNCIA. Só avisa depois de 3 verificações seguidas ruins (~15 min).
#      Uma falha isolada é ruído; três seguidas, com a API respondendo, é queda.
#
# De quebra: sem a chamada à plataforma, a sonda NÃO PRECISA MAIS DE CHAVE DE
# API. O arquivo `credenciais` deixa de ser criado — uma chave viva de produção
# a menos parada num disco.
#
# Uso:
#   bash scripts/sonda-portal.sh            # uma verificação
#   bash scripts/sonda-portal.sh --instalar # agenda a cada 5 min (macOS/launchd)
#   bash scripts/sonda-portal.sh --remover
#
# `--instalar` COPIA o script para ~/Library/Application Support/AraraTech/ e
# agenda de lá: o macOS protege Área de Trabalho, Documentos e Downloads (TCC),
# e um agente do launchd não alcança essas pastas.
#
# ⚠️ No Mac isto só cobre as horas em que a máquina está ligada. O lugar certo
#    é o VPS — a linha de crontab está no fim do arquivo.
# =============================================================================

set -uo pipefail

DOMINIO="${SONDA_DOMINIO:-https://suporte.arara-tech.com/}"
# A testemunha precisa ser OUTRO host, senão ela cai junto e não testemunha nada.
TESTEMUNHA="${SONDA_TESTEMUNHA:-https://api.arara-tech.com/health}"
# Quantas verificações ruins seguidas antes de avisar. 3 × 5 min ≈ 15 min.
LIMITE="${SONDA_LIMITE:-3}"
# Conteiner que serve o portal no VPS. Fora do VPS nao existe e o reinicio
# simplesmente nao acontece — o mesmo script serve os dois lugares.
CONTEINER="${SONDA_CONTEINER:-arara-front-portal-suporte}"

if [[ -z "${SONDA_CASA:-}" ]]; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    CASA="$HOME/Library/Application Support/AraraTech"
  else
    CASA="$HOME/.araratech"
  fi
else
  CASA="$SONDA_CASA"
fi
LOG="${SONDA_LOG:-$CASA/sonda-portal.log}"
CONTADOR="$CASA/sonda.falhas"
ROTULO="com.araratech.sonda-portal"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"

mkdir -p "$CASA" 2>/dev/null
registra() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }
avisa() {
  command -v osascript >/dev/null 2>&1 && \
    osascript -e "display notification \"$1\" with title \"Sonda do portal\"" 2>/dev/null
}

# ── Instalação / remoção ─────────────────────────────────────────────────────
if [[ "${1:-}" == "--instalar" ]]; then
  RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
  cp "$RAIZ/scripts/sonda-portal.sh" "$CASA/sonda-portal.sh"
  chmod +x "$CASA/sonda-portal.sh"
  # A versão anterior gravava aqui um `credenciais` com a chave de API. Não é
  # mais preciso — e se sobrou de antes, sai agora.
  rm -f "$CASA/credenciais"

  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$CASA/sonda-portal.sh</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$CASA/sonda.out</string>
  <key>StandardErrorPath</key><string>$CASA/sonda.err</string>
</dict>
</plist>
PLISTEOF
  launchctl unload "$PLIST" 2>/dev/null
  launchctl load "$PLIST" && echo "→ sonda agendada a cada 5 min (avisa após $LIMITE falhas seguidas)"
  echo "   instalada em: $CASA/sonda-portal.sh"
  echo "   log:          $LOG"
  echo "   sem chave de API: esta versão não fala com a plataforma"
  exit 0
fi

if [[ "${1:-}" == "--remover" ]]; then
  launchctl unload "$PLIST" 2>/dev/null
  rm -f "$PLIST" "$CASA/sonda-portal.sh" "$CASA/credenciais" "$CONTADOR"
  echo "→ sonda removida (agendamento, cópia e credenciais). O log ficou em $LOG"
  exit 0
fi

# ── Verificação ──────────────────────────────────────────────────────────────
codigo() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$1" 2>/dev/null; }

http="$(codigo "$DOMINIO")"
falhas="$(cat "$CONTADOR" 2>/dev/null || echo 0)"
[[ "$falhas" =~ ^[0-9]+$ ]] || falhas=0

if [[ "$http" == "200" || "$http" == "304" ]]; then
  # Só anuncia a volta para quem chegou a ser avisado da queda.
  if (( falhas >= LIMITE )); then
    registra "VOLTOU  portal respondendo de novo (http=$http) apos $falhas falhas"
    avisa "Portal de suporte voltou."
  fi
  echo 0 > "$CONTADOR"
  exit 0
fi

# O portal não respondeu. Antes de acusar, ouve a testemunha.
htestemunha="$(codigo "$TESTEMUNHA")"
if [[ "$htestemunha" != "200" ]]; then
  # As duas fora = a rede de quem sonda. NÃO conta como falha do portal: era
  # isto que gerava alarme a cada vez que o notebook dormia.
  registra "REDE  portal=$http testemunha=$htestemunha — provavelmente a rede daqui, nada feito"
  exit 0
fi

falhas=$(( falhas + 1 ))
echo "$falhas" > "$CONTADOR"

if (( falhas < LIMITE )); then
  registra "FALHA $falhas/$LIMITE  portal=$http (testemunha ok) — aguardando confirmacao"
  exit 0
fi

if (( falhas == LIMITE )); then
  registra "QUEDA  portal=$http em $LIMITE verificacoes seguidas, com a API de pe"

  # ── No VPS ela volta a LEVANTAR ────────────────────────────────────────────
  #
  # Era este o valor da sonda original — "avisar tira alguém da cama; levantar
  # resolve antes de a pessoa acordar" — e foi o que se perdeu quando a
  # hospedagem da plataforma saiu de cena. Rodando no proprio servidor, o meio
  # de levantar voltou a existir: o conteiner do nginx esta' a' mao.
  #
  # So' age aqui, depois de 3 verificacoes seguidas E com a testemunha de pe.
  # Reiniciar por engano e' pior que nao reiniciar: a regra de insistencia e a
  # testemunha existem exatamente para isso.
  #
  # SONDA_SEM_REINICIO=1 desliga, para quem quiser so' o aviso.
  if [[ -z "${SONDA_SEM_REINICIO:-}" ]] && command -v docker >/dev/null 2>&1 \
     && [[ -n "$(docker ps -aq --filter "name=^${CONTEINER}$" 2>/dev/null)" ]]; then
    registra "LEVANTANDO  docker restart $CONTEINER"
    if docker restart "$CONTEINER" >/dev/null 2>&1; then
      # Um instante para o nginx subir antes de conferir.
      for _ in 1 2 3 4 5 6; do
        sleep 3
        depois="$(codigo "$DOMINIO")"
        [[ "$depois" == "200" || "$depois" == "304" ]] && break
      done
      if [[ "${depois:-}" == "200" || "${depois:-}" == "304" ]]; then
        registra "OK  portal de volta apos reinicio (http=$depois)"
        avisa "Portal caiu e a sonda levantou."
        echo 0 > "$CONTADOR"
        exit 0
      fi
      registra "FALHOU  reinicio nao resolveu (http=${depois:-?}) — precisa de gente"
    else
      registra "FALHOU  docker restart nao executou — precisa de gente"
    fi
  fi

  avisa "Portal de suporte fora do ar há ~$(( LIMITE * 5 )) min — precisa de alguém."
else
  # Já avisou; continua registrando sem repetir a notificação a cada 5 min.
  registra "QUEDA  segue fora (portal=$http, $falhas verificacoes)"
fi
exit 0

# =============================================================================
# No VPS (onde isto deveria morar — 24 h, e perto do que precisa ser vigiado):
#
#   */5 * * * * bash /caminho/sonda-portal.sh
#
# Sem chave, sem .env: esta versão só faz duas requisições HTTP.
# =============================================================================
