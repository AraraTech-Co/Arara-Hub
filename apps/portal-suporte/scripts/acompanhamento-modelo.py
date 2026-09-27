#!/usr/bin/env python3
# =============================================================================
# Acompanhamento do cliente — passo 1: os campos no chamado.
#
# Especificação: docs/plans/especificacao-acompanhamento-do-cliente.md
#
# Quatro campos. O código fica em CLARO, e isso é decisão, não descuido: o
# sandbox não tem `crypto`, logo não há função de resumo decente disponível
# lá. Guardar em claro é aceitável porque quem lê este campo já lê o chamado
# inteiro — o código não protege de quem tem acesso ao banco, protege de quem
# só conhece o número do chamado.
#
#   python3 scripts/acompanhamento-modelo.py            # simula
#   python3 scripts/acompanhamento-modelo.py --aplicar
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

CAMPOS = {
    # Seis caracteres, alfabeto sem 0 O 1 I L — a pessoa lê de uma mensagem e
    # digita; confundir zero com ó gera "código inválido" e um chamado sobre o
    # chamado.
    "acomp_codigo": {"type": "string"},
    # Enquanto aberto + 7 dias após fechar. Expirar no fechamento tiraria o
    # acesso justo quando a pessoa quer reler o que foi feito.
    "acomp_expira_em": {"type": "string"},
    "acomp_tentativas": {"type": "number"},
    "acomp_bloqueado_ate": {"type": "string"},
}

# O telefone declarado do chamado, para quem abriu por WhatsApp. Hoje o número
# vive só na CONVERSA (`remote_jid`); sem ele aqui, reenviar o código exigiria
# achar a conversa de volta.
CAMPOS["acomp_whatsapp"] = {"type": "string"}


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
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(MODELS)
    ticket = [m for m in d["models"] if m["name"] == "portal-suporte-Ticket"][0]
    props = dict(ticket["schema"].get("properties", {}))

    # `phone` existe nos REGISTROS do Profile mas não no schema declarado
    # (achado em 27/08). Aproveitamos para declarar, senão quem ler o schema
    # conclui que a recuperação de senha lê um campo inexistente.
    perfil = [m for m in d["models"] if m["name"] == "portal-suporte-Profile"][0]
    props_perfil = dict(perfil["schema"].get("properties", {}))
    falta_phone = "phone" not in props_perfil

    faltando = {k: v for k, v in CAMPOS.items() if k not in props}
    if not faltando and not falta_phone:
        print("= tudo já existe")
        return
    if faltando:
        print(f"→ Ticket: +{len(faltando)} campos — {', '.join(sorted(faltando))}")
    if falta_phone:
        print("→ Profile: declarar o campo `phone` (já existe nos registros)")
    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return

    if faltando:
        props.update(faltando)
        c, r = req(f"{MODELS}/portal-suporte-Ticket", "PATCH",
                   {"schema": {"type": "object", "properties": props}})
        print(f"   Ticket: HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            sys.exit(1)
    if falta_phone:
        props_perfil["phone"] = {"type": "string"}
        c, r = req(f"{MODELS}/portal-suporte-Profile", "PATCH",
                   {"schema": {"type": "object", "properties": props_perfil}})
        print(f"   Profile: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
