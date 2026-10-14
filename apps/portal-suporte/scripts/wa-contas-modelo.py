#!/usr/bin/env python3
# =============================================================================
# Fase 3a — contas de WhatsApp por setor: SÓ O SCHEMA.
#
# O que este script faz:
#
#   WaConta (model novo)              id, nome, setor, ativa, criada_em
#   WhatsAppConversation.conta_id     de qual conta é a conversa
#
# O que ele NÃO faz, de propósito: não preenche `conta_id` nas conversas que já
# existem. O código trata ausente/vazio como a conta default, então reescrever
# centenas de linhas não compraria nada — e migração de dados é a parte que não
# tem volta fácil. Schema aditivo não altera nenhum registro: enquanto ninguém
# cadastrar uma segunda conta, o portal funciona exatamente como hoje.
#
# O TOKEN NÃO MORA NO MODEL. Cada conta lê o seu no secret store, sob o nome
# `whatsapp_token_<id>`; sem esse segredo, o código cai no `whatsapp_token`
# único de hoje. É esse fallback que faz a conta default continuar funcionando
# sem nenhuma configuração nova. Guardar token num model seria guardá-lo onde
# qualquer rota que lê o model passa a lê-lo também.
#
# Uso:
#   python3 scripts/wa-contas-modelo.py              # simula e sai
#   python3 scripts/wa-contas-modelo.py --aplicar    # escreve
#
# Quem roda é o Leonardo. Sem --aplicar nenhuma requisição de escrita sai —
# ver o teste em scripts/testes-handlers/wa-conta.test.js, que confere isso
# lendo o próprio arquivo.
#
# Idempotente: rodar duas vezes não recria o model nem duplica propriedade.
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

# ── Model novo: as contas ────────────────────────────────────────────────────
# `id` é curto e estável porque entra no nome do segredo
# (`whatsapp_token_<id>`) e no grant de permissão (`wa_conta_<id>`): mudar o id
# depois significaria renomear segredo e grant em dois lugares.
CONTA = {
    "name": "portal-suporte-WaConta",
    "alias": "WaConta",
    "schema": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            # "Suporte", "Vendas" — o que aparece na aba da inbox.
            "nome": {"type": "string"},
            # O setor que atende por este número. Separado do nome porque o
            # nome é rótulo de tela e pode mudar sem mexer em regra.
            "setor": {"type": "string"},
            # Conta desligada não recebe aba nem entra em filtro; o histórico
            # dela continua acessível a quem tem o grant.
            "ativa": {"type": "boolean"},
            # O NÚMERO da conta, em dígitos com o 55. Serve para identificar a
            # conta pelo destino da mensagem (Fase 3b) e para recusar iniciar
            # conversa com o próprio número — que hoje não tem como ser
            # recusado, porque o portal não guarda o número da instância em
            # lugar nenhum (ver a pendência `waNumeroDaConta`).
            "numero": {"type": "string"},
            "criada_em": {"type": "string"},
            "created_at": {"type": "string"},
        },
    },
}

# ── Campo novo na conversa ───────────────────────────────────────────────────
# Ausente ou vazio = conta default. É isso que dispensa o backfill.
CAMPOS_CONVERSA = {
    "conta_id": {"type": "string"},
}

CONVERSA = "portal-suporte-WhatsAppConversation"


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

    passos = []

    # ── 1. o model WaConta ───────────────────────────────────────────────────
    if CONTA["name"] in por_nome:
        print("= WaConta: já existe")
    else:
        passos.append("criar o model WaConta")
        print("→ WaConta: criar model")

    # ── 2. conta_id na conversa ──────────────────────────────────────────────
    conversa = por_nome.get(CONVERSA)
    if not conversa:
        print(f"! model {CONVERSA} não encontrado — nada a fazer com segurança")
        sys.exit(1)
    props = dict(conversa["schema"].get("properties", {}))
    faltando = {k: v for k, v in CAMPOS_CONVERSA.items() if k not in props}
    if not faltando:
        print("= WhatsAppConversation.conta_id: já existe")
    else:
        passos.append("acrescentar conta_id em WhatsAppConversation")
        print(f"→ WhatsAppConversation: +{len(faltando)} campo(s) — {', '.join(sorted(faltando))}")

    if not passos:
        print("\n   nada a fazer: o schema já está como a Fase 3a quer.")
        return

    print("\n   PLANO (" + str(len(passos)) + " passo(s)):")
    for p in passos:
        print(f"     - {p}")
    print("   Nenhuma conversa é reescrita: ausente = conta default.")

    if not aplicar:
        print("\n   (simulação — nada foi enviado. Use --aplicar para escrever.)")
        return

    # ── escreve ──────────────────────────────────────────────────────────────
    if CONTA["name"] not in por_nome:
        c, r = req(MODELS, "POST", CONTA)
        print(f"   WaConta: HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            sys.exit(1)

    if faltando:
        props.update(faltando)
        c, r = req(f"{MODELS}/{CONVERSA}", "PATCH",
                   {"schema": {"type": "object", "properties": props}})
        print(f"   conta_id: HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            sys.exit(1)

    print("\n   ✓ schema aplicado.")
    print("""
   CAMINHO DE VOLTA
   Nada foi reescrito, então desfazer é remover o que foi acrescentado:
     - apagar o model WaConta   → DELETE {models}/portal-suporte-WaConta
     - remover conta_id         → PATCH do schema de WhatsAppConversation
                                  sem a propriedade `conta_id`
   ⚠ Remover propriedade depois que alguma conversa já tiver conta_id gravado
   APAGA esse valor. Se já houver segunda conta cadastrada e conversas nela, o
   caminho de volta deixa de ser seguro: aí é preciso primeiro anotar quais
   conversas têm conta_id diferente da default.

   PRÓXIMO PASSO MANUAL (não é deste script): cadastrar o segredo
   `whatsapp_token_<id>` de cada conta nova no secret store. Sem ele, a conta
   usa o `whatsapp_token` único — o que é exatamente o certo para a default.
""".replace("{models}", MODELS))


if __name__ == "__main__":
    main()
