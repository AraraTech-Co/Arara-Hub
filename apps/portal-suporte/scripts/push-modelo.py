#!/usr/bin/env python3
# =============================================================================
# Fase 4 — Web Push: os três models.
#
#   PushInscricao   a assinatura de um navegador (endpoint + chaves do browser)
#   PushPreferencia o que cada pessoa quer receber
#   PushNaFila      a notificação a enviar no próximo tick do relógio
#
# POR QUE FILA: enviar Web Push exige assinar um JWT VAPID com ECDSA P-256 e
# cifrar o payload (ECDH + HKDF + AES-GCM). Isso vive na biblioteca `web-push`,
# que é `import` de TypeScript — e os handlers são strings compiladas com
# `new Function`, SEM require (foi o que quebrou o `require("crypto")` na rota
# de varredura). Então o handler ENFILEIRA e o agendador, que é TypeScript de
# verdade, ENVIA. O preço é até 1 minuto de atraso, que é o que o próprio
# critério da fase aceita.
#
# A fila é limpa no mesmo tick: enviada ou descartada, a linha sai. Entrada com
# mais de 24 h é descartada sem enviar — aviso velho é ruído, e fila que só
# cresce vira a próxima tabela a bater no teto de 500.
#
# Uso:
#   python3 scripts/push-modelo.py              # simula
#   python3 scripts/push-modelo.py --aplicar    # escreve
#
# Quem roda é o Leonardo.
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MODELS = f"{API}/v1/apps/portal-suporte/models"

INSCRICAO = {
    "name": "portal-suporte-PushInscricao",
    "alias": "PushInscricao",
    "schema": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "user_id": {"type": "string"},
            # O endpoint é a identidade da inscrição para o push service.
            "endpoint": {"type": "string"},
            # Chaves PÚBLICAS do navegador (o par privado nunca sai dele).
            "p256dh": {"type": "string"},
            "auth": {"type": "string"},
            # Para distinguir "o Chrome do desktop" do "Safari do celular" na
            # tela de preferências.
            "ua": {"type": "string"},
            "criada_em": {"type": "string"},
            "created_at": {"type": "string"},
        },
    },
}

PREFERENCIA = {
    "name": "portal-suporte-PushPreferencia",
    "alias": "PushPreferencia",
    "schema": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "user_id": {"type": "string"},
            # Os três eventos que hoje alimentam o sino.
            "fila": {"type": "boolean"},
            "minha_conversa": {"type": "boolean"},
            "chamado_atribuido": {"type": "boolean"},
            "updated_at": {"type": "string"},
            "created_at": {"type": "string"},
        },
    },
}

FILA = {
    "name": "portal-suporte-PushNaFila",
    "alias": "PushNaFila",
    "schema": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "user_id": {"type": "string"},
            "titulo": {"type": "string"},
            "corpo": {"type": "string"},
            # Para onde o clique leva (conversa ou chamado).
            "url": {"type": "string"},
            # `fila` | `minha_conversa` | `chamado_atribuido` — é por este
            # campo que a preferência é conferida no momento de enviar.
            "tipo": {"type": "string"},
            # `pendente` sempre; o tick LÊ POR FILTRO por este campo, nunca
            # varre a tabela. Linha enviada ou descartada é APAGADA, então
            # outro valor nunca fica gravado — o campo existe para o filtro.
            "status": {"type": "string"},
            "created_at": {"type": "string"},
        },
    },
}


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=240) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]


def main():
    aplicar = "--aplicar" in sys.argv
    c, d = req(MODELS)
    if c >= 300 or not isinstance(d, dict):
        print(f"! HTTP {c} ao listar os models: {d}")
        sys.exit(1)
    por_nome = {m["name"]: m for m in d.get("models", [])}

    faltam = [m for m in (INSCRICAO, PREFERENCIA, FILA) if m["name"] not in por_nome]
    for m in (INSCRICAO, PREFERENCIA, FILA):
        print(("→ criar  " if m in faltam else "= existe ") + m["alias"])

    if not faltam:
        print("\n   nada a fazer.")
        return

    print(f"\n   PLANO: criar {len(faltam)} model(s). Nenhum registro existente é tocado.")
    if not aplicar:
        print("\n   (simulação — nada foi enviado. Use --aplicar para escrever.)")
        return

    for m in faltam:
        c, r = req(MODELS, "POST", m)
        print(f"   {m['alias']}: HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            sys.exit(1)

    print("""
   ✓ models criados.

   CAMINHO DE VOLTA: apagar os três models. Nada mais foi alterado — nenhum
   registro de conversa, chamado ou perfil é tocado por este script.

   PRÓXIMO PASSO MANUAL: gerar as chaves VAPID com
   `python3 scripts/push-vapid.py --aplicar`. Sem elas, o envio fica desligado
   e o portal segue com o sino, como hoje.
""")


if __name__ == "__main__":
    main()
