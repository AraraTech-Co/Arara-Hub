#!/usr/bin/env python3
# =============================================================================
# Módulo de Projetos e Gantt — Entrega 1, passo 1: o modelo de dados.
#
# Especificação: docs/plans/especificacao-modulo-projetos-e-gantt-portal-suporte.md
# Plano:         docs/plans/plano-modulo-projetos-e-gantt-portal-suporte.md
#
# DECISÃO QUE GOVERNA ESTE SCRIPT: a unidade de execução é o CARD do Kanban Dev.
# Não existe entidade de tarefa nova — o card ganha projeto, fase e datas de
# planejamento. O model `Task` (vazio, nunca adotado) fica como está.
#
# O QUE NÃO É CRIADO, DE PROPÓSITO:
#   - `fim_planejado` no Ticket. `previsao_entrega` JÁ é a data de entrega
#     prevista (decisão 17 do Kanban Dev). Duas datas de entrega no mesmo card é
#     a receita conhecida para as duas divergirem.
#   - qualquer campo de organização/tenant. Este app não tem multi-tenancy, e um
#     campo que não isola nada dá falsa sensação de segurança.
#
#   python3 scripts/projetos-modelo.py            # simula
#   python3 scripts/projetos-modelo.py --aplicar
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
# Cinco. O card vai de 61 para 66 campos — e a lista de campos permitidos da
# rota do quadro (scripts/kanban-performance.py) precisa recebê-los no passo
# 1.5, senão o quadro não os enxerga.
CAMPOS_TICKET = {
    "projeto_id": {"type": "string"},
    "fase_id": {"type": "string"},
    # Data de CALENDÁRIO, "YYYY-MM-DD" — nunca instante. Timestamp faz o prazo
    # de 27/08 virar dia 26 para quem estiver num fuso a oeste.
    "inicio_planejado": {"type": "string"},
    # Esforço previsto em MINUTOS inteiros, na mesma unidade do
    # TicketTimeEntry que já existe. Misturar horas e minutos entre as duas
    # tabelas garante a conta errada no dia em que forem somadas.
    "estimativa_min": {"type": "number"},
    # Só quando AJUSTADO À MÃO. Vazio = derivado do status do fluxo Dev.
    "progresso": {"type": "number"},
}

# ── Campo novo no ActivityLog ────────────────────────────────────────────────
# O histórico do projeto reusa o log que já registra as movimentações do quadro
# desde 18/08. Um segundo sistema de histórico só criaria mais um lugar para
# procurar quando alguém perguntar "quem mudou essa data?".
CAMPOS_LOG = {
    "projeto_id": {"type": "string"},
}


def model(nome, props):
    return {
        "name": f"portal-suporte-{nome}",
        "alias": nome,
        "schema": {"type": "object", "properties": props},
    }


NOVOS = [
    # ── A coisa que tem começo, meio e fim ───────────────────────────────────
    model("Projeto", {
        "id": {"type": "string"},
        # PRJ-001 — sequencial próprio, servido pelo contador TicketSequence
        # com key="projeto". Contar registros para achar o próximo número gera
        # dois PRJ-004 quando duas pessoas criam ao mesmo tempo.
        "codigo": {"type": "string"},
        "nome": {"type": "string"},
        "descricao": {"type": "string"},
        # "interno" | "cliente"
        "tipo": {"type": "string"},
        # Obrigatório quando tipo="cliente"; vazio quando interno.
        # Company aqui é CLIENTE, não inquilino — não isola nada.
        "company_id": {"type": "string"},
        # "planejado" | "em_andamento" | "pausado" | "concluido" | "cancelado"
        "status": {"type": "string"},
        "inicio_planejado": {"type": "string"},
        "fim_planejado": {"type": "string"},
        "responsavel_id": {"type": "string"},
        "created_at": {"type": "string"},
        # Carimbo de concorrência otimista: toda gravação manda o updated_at que
        # leu, e o servidor recusa se mudou no meio.
        "updated_at": {"type": "string"},
        "arquivado_em": {"type": "string"},
        "criado_por": {"type": "string"},
    }),

    # ── O agrupador dentro do projeto ────────────────────────────────────────
    model("ProjetoFase", {
        "id": {"type": "string"},
        "projeto_id": {"type": "string"},
        "nome": {"type": "string"},
        "ordem": {"type": "number"},
        "cor": {"type": "string"},
        "inicio_planejado": {"type": "string"},
        "fim_planejado": {"type": "string"},
        # false = datas derivadas dos cards (menor início, maior fim);
        # true  = alguém fixou na mão e a derivação não sobrescreve.
        "datas_manuais": {"type": "boolean"},
        "created_at": {"type": "string"},
        "updated_at": {"type": "string"},
    }),

    # ── Quem participa ───────────────────────────────────────────────────────
    model("ProjetoMembro", {
        "id": {"type": "string"},
        "projeto_id": {"type": "string"},
        # users.id da plataforma — a identidade canônica, nunca o Profile.
        "user_id": {"type": "string"},
        # "responsavel" | "participante" | "observador"
        "papel": {"type": "string"},
        "created_at": {"type": "string"},
    }),

    # ── Data que importa e não tem duração ───────────────────────────────────
    model("ProjetoMarco", {
        "id": {"type": "string"},
        "projeto_id": {"type": "string"},
        "nome": {"type": "string"},
        "data": {"type": "string"},
        "atingido_em": {"type": "string"},
        "created_at": {"type": "string"},
        "updated_at": {"type": "string"},
    }),

    # ── "Este card só começa depois daquele" ─────────────────────────────────
    model("CardDependencia", {
        "id": {"type": "string"},
        # Guardado também aqui para a checagem "não atravessa projeto" não
        # precisar carregar os dois cards.
        "projeto_id": {"type": "string"},
        "origem_ticket_id": {"type": "string"},
        "destino_ticket_id": {"type": "string"},
        # Só "fim_para_inicio" nesta entrega. O campo existe para os outros três
        # tipos caberem depois sem migração.
        "tipo": {"type": "string"},
        "created_at": {"type": "string"},
        "criado_por": {"type": "string"},
    }),

    # ── As fases que se repetem em projeto de cliente ────────────────────────
    model("FaseModelo", {
        "id": {"type": "string"},
        "nome": {"type": "string"},
        # JSON: [{nome, ordem, cor}]
        "fases": {"type": "array"},
        "created_at": {"type": "string"},
        "criado_por": {"type": "string"},
    }),
]


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


def acrescentar_campos(por_nome, nome, campos, aplicar):
    m = por_nome.get(nome)
    if not m:
        print(f"! model {nome} não encontrado")
        sys.exit(1)
    props = dict(m["schema"].get("properties", {}))
    faltando = {k: v for k, v in campos.items() if k not in props}
    if not faltando:
        print(f"= {m['alias']}: todos os campos já existem")
        return
    print(f"→ {m['alias']}: +{len(faltando)} campos — {', '.join(sorted(faltando))}")
    if not aplicar:
        return
    props.update(faltando)
    c, r = req(f"{MODELS}/{nome}", "PATCH", {"schema": {"type": "object", "properties": props}})
    print(f"   HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(MODELS)
    por_nome = {m["name"]: m for m in d["models"]}

    acrescentar_campos(por_nome, "portal-suporte-Ticket", CAMPOS_TICKET, aplicar)
    acrescentar_campos(por_nome, "portal-suporte-ActivityLog", CAMPOS_LOG, aplicar)

    for novo in NOVOS:
        if novo["name"] in por_nome:
            print(f"= {novo['alias']}: já existe")
            continue
        print(f"→ {novo['alias']}: criar model ({len(novo['schema']['properties'])} campos)")
        if not aplicar:
            continue
        c, r = req(MODELS, "POST", novo)
        print(f"   HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            sys.exit(1)

    if not aplicar:
        print("\n   (simulação — nada foi gravado; use --aplicar)")


if __name__ == "__main__":
    main()
