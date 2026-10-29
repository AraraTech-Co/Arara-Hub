#!/usr/bin/env python3
# =============================================================================
# Módulo de Projetos — o modelo das atividades próprias do projeto.
#
# Base: plano técnico de 28/10/2026 (docs/portal-suporte/
# 2026-10-28-analise-kanban-por-projeto.md), §6.1. As rotas estão em
# `scripts/projetos-atividades.py`.
#
# DECISÃO QUE GOVERNA ESTE SCRIPT: a decisão B do Leonardo — Projetos é
# independente dos cards do Kanban Dev. A atividade é entidade PRÓPRIA, e não
# campo novo no `Ticket` nem uso do model `Task`:
#
#   - `Ticket` tem leitores que NÃO distinguem quadro (auto-fechamento, mapa de
#     calor, contexto da empresa, causa-raiz). Atividade gravada como Ticket
#     entraria nesses contadores e nas filas de chamado;
#   - `Task` e as 9 rotas `/tasks` gravam o corpo inteiro sem lista branca,
#     filtram pela query e devolvem 501 em `assign` e `complete`.
#
# O QUE NÃO É CRIADO, DE PROPÓSITO:
#   - dependência entre atividades (D11 do plano, proposta: fora da v1). Campo
#     que não tem leitor é campo que ninguém mantém;
#   - percentual próprio da atividade. O progresso do projeto vem da CONTAGEM de
#     conclusões (protótipo da D4); um percentual por atividade seria a segunda
#     verdade sobre a mesma coisa;
#   - campo de organização ou inquilino. Este app não tem multi-tenancy, e campo
#     que não isola nada dá falsa sensação de segurança;
#   - campo novo no `ActivityLog`. O histórico da atividade é PRÓPRIO
#     (`ProjetoAtividadeEvento`): os leitores do log do portal têm reserva
#     `findMany({})`, que devolve as 500 linhas mais novas do log inteiro, e
#     evento de atividade empurraria evento de chamado para fora da auditoria.
#
# `status`, `ordem` e a ausência de exclusão são PROTÓTIPO autorizado, não regra
# aprovada: D2 (colunas), D3 (cancelamento) e D5 (campos) continuam em aberto.
#
#   python3 scripts/projetos-atividades-modelo.py            # simula
#   python3 scripts/projetos-atividades-modelo.py --aplicar
# =============================================================================

import sys


def model(nome, props):
    return {
        "name": f"portal-suporte-{nome}",
        "alias": nome,
        "schema": {"type": "object", "properties": props},
    }


NOVOS = [
    # ── A unidade de trabalho DO PROJETO ─────────────────────────────────────
    model("ProjetoAtividade", {
        "id": {"type": "string"},
        # Sempre o projeto da URL, nunca o do corpo: aceitar o do corpo deixaria
        # quem pode escrever num projeto escrever em qualquer outro.
        "projeto_id": {"type": "string"},
        # Opcional, e conferido como sendo do MESMO projeto a cada gravação.
        "fase_id": {"type": "string"},
        # O único campo obrigatório do cadastro (protótipo da D5).
        "titulo": {"type": "string"},
        "descricao": {"type": "string"},
        # As 7 etapas do fluxo (decisão de 29/10), mais `cancelada`:
        # backlog | em_desenvolvimento | finalizado_dev | pronto_para_teste |
        # teste_aprovado | teste_reprovado | deploy_feito | cancelada.
        #
        # O schema declara `string` e NÃO uma lista fechada, de propósito: a
        # lista válida é conferida no handler, que é quem recusa com 400. Pôr a
        # lista aqui também criaria um segundo lugar para mantê-la, e uma etapa
        # nova passaria a exigir mudança no modelo — gravação em produção — em
        # vez de um deploy de rota.
        #
        # `cancelada` fica FORA do denominador do progresso e CONTINUA visível:
        # se contasse, cancelar trabalho que não vai acontecer derrubaria o
        # percentual, e quem cancela estaria sendo punido por organizar a lista.
        # Não existe apagar: cancelar é o caminho.
        "status": {"type": "string"},
        # Posição dentro da coluna do Kanban. Número e não lista encadeada
        # porque a camada não tem gravação condicional: reordenar por ponteiro
        # exigiria duas gravações atômicas, que não existem aqui.
        "ordem": {"type": "number"},
        # users.id da plataforma — a identidade canônica, nunca o Profile.
        "responsavel_id": {"type": "string"},
        # Datas de CALENDÁRIO ("AAAA-MM-DD"). Timestamp aqui faz o prazo de
        # 27/08 virar dia 26 para quem estiver num fuso a oeste.
        "inicio_planejado": {"type": "string"},
        "previsao_entrega": {"type": "string"},
        "estimativa_min": {"type": "number"},
        # Carimbos que acompanham o status nos DOIS sentidos: reabrir limpa o
        # `concluida_em`, senão a atividade volta para a coluna ainda com data
        # de conclusão.
        "concluida_em": {"type": "string"},
        "cancelada_em": {"type": "string"},
        "criado_por": {"type": "string"},
        "created_at": {"type": "string"},
        # Carimbo de concorrência otimista: quem grava manda o updated_at que
        # leu. Continua OPCIONAL, como no resto do módulo — a camada não tem
        # gravação condicional, então nem exigindo haveria garantia forte (§10
        # do plano, barreira T3).
        "updated_at": {"type": "string"},
    }),

    # ── O histórico, só das atividades ───────────────────────────────────────
    model("ProjetoAtividadeEvento", {
        "id": {"type": "string"},
        # "atividade_criada" | "atividade_alterada"
        "action": {"type": "string"},
        "projeto_id": {"type": "string"},
        "atividade_id": {"type": "string"},
        "user_id": {"type": "string"},
        "details": {"type": "string"},
        "occurred_at": {"type": "string"},
        "created_at": {"type": "string"},
    }),
]


def main():
    aplicar = "--aplicar" in sys.argv
    if not aplicar:
        for m in NOVOS:
            props = m["schema"]["properties"]
            print(f"   → {m['alias']}: {len(props)} campos ({', '.join(props)})")
        print("\n   (simulação — use --aplicar)")
        return

    # A chave privada da plataforma só é necessária aqui, e por isso o import
    # vem agora: simular não precisa dela.
    from _projetos_comum import API, KEY, req  # noqa: PLC0415

    APP = f"{API}/v1/apps/portal-suporte"
    c, d = req(f"{APP}/models")
    if c >= 300:
        print(f"! não listou os models: HTTP {c} {d}")
        sys.exit(1)
    por_nome = {m["name"]: m for m in d["models"]}
    for novo in NOVOS:
        if novo["name"] in por_nome:
            print(f"   = {novo['alias']} já existe")
            continue
        c, r = req(f"{APP}/models", "POST", novo)
        print(f"   → criar {novo['alias']}: HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            sys.exit(1)
    print("→ models das atividades prontos")


if __name__ == "__main__":
    main()
