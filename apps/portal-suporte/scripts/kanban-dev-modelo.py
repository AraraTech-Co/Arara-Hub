#!/usr/bin/env python3
# =============================================================================
# Fase 1 do Kanban Dev — o dado.
#
# Antes de escrever qualquer campo, olhei o que o `Ticket` JÁ tem. O achado
# encolheu esta fase pela metade: `version`, `root_cause_category`,
# `pull_request_url`, `column_entered_at`, `environment`, `module`, `product`,
# `recurring` e `severity/impact/source` já existem. Boa parte do §17 já tem
# onde morar — o que falta é a trava, não o campo.
#
# O que este script acrescenta, e só isso:
#
#   Ticket.quadro            "suporte" | "dev"      — de que quadro é o card
#   Ticket.origem_ticket_id  id do chamado que gerou o card Dev (nulo se interno)
#   Ticket.migrado           marca da virada (isento das regras na etapa atual)
#   Ticket.previsao_entrega  data opcional, INTERNA — não é SLA, não alerta
#   Ticket.esforco_entrega   asap | meio_sprint | um_sprint | dois_sprints |
#                            indeterminado — escolhido ao entrar em Aguardando
#                            Início; a previsão (sexta 12:00) deriva daqui
#   Ticket.declaracoes       declarações assinadas do §17 (autor, hora, texto)
#
#   Versao (model novo)      numero, descricao, data, criado_por
#
# SEM BACKFILL de `quadro`: ausência lê como "suporte" no portal, que é o que
# 100% dos 471 tickets são hoje. Um update em massa em produção para gravar o
# valor que o padrão já entrega é risco sem ganho.
#
# `version` (texto, que já existe) continua sendo o que o card exibe; o model
# `Versao` existe para padronizar a lista de escolha — não para substituí-lo.
#
#   python3 scripts/kanban-dev-modelo.py            # simula
#   python3 scripts/kanban-dev-modelo.py --aplicar
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

# ── Campos novos no Ticket ───────────────────────────────────────────────────
CAMPOS_TICKET = {
    "quadro": {"type": "string"},
    "origem_ticket_id": {"type": "string"},
    "migrado": {"type": "boolean"},
    "previsao_entrega": {"type": "string"},
    "esforco_entrega": {"type": "string"},
    "declaracoes": {"type": "array"},
}

# ── Model novo: cadastro de versões ──────────────────────────────────────────
VERSAO = {
    "name": "portal-suporte-Versao",
    "alias": "Versao",
    "schema": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            # "2.7.1" — o texto que vai parar em Ticket.version
            "numero": {"type": "string"},
            "descricao": {"type": "string"},
            # Data de disponibilização da versão (não a da aplicação no cliente,
            # que é do card).
            "data": {"type": "string"},
            "criado_por": {"type": "string"},
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
    _, d = req(MODELS)
    por_nome = {m["name"]: m for m in d["models"]}

    # ── 1. Campos no Ticket ──────────────────────────────────────────────────
    ticket = por_nome.get("portal-suporte-Ticket")
    if not ticket:
        print("! model Ticket não encontrado")
        sys.exit(1)
    props = dict(ticket["schema"].get("properties", {}))
    faltando = {k: v for k, v in CAMPOS_TICKET.items() if k not in props}
    if not faltando:
        print("= Ticket: todos os campos já existem")
    else:
        print(f"→ Ticket: +{len(faltando)} campos — {', '.join(sorted(faltando))}")
        if aplicar:
            props.update(faltando)
            novo = {"schema": {"type": "object", "properties": props}}
            c, r = req(f"{MODELS}/{ticket['name']}", "PATCH", novo)
            print(f"   HTTP {c} {'' if c < 300 else r}")
            if c >= 300:
                sys.exit(1)

    # ── 2. Model Versao ──────────────────────────────────────────────────────
    if VERSAO["name"] in por_nome:
        print("= Versao: já existe")
    else:
        print("→ Versao: criar model")
        if aplicar:
            c, r = req(MODELS, "POST", VERSAO)
            print(f"   HTTP {c} {'' if c < 300 else r}")
            if c >= 300:
                sys.exit(1)

    if not aplicar:
        print("\n   (simulação — use --aplicar)")


if __name__ == "__main__":
    main()
