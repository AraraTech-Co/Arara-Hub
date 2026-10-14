#!/usr/bin/env python3
# =============================================================================
# Fase 5 — repositório de arquivos de apoio: o schema.
#
#   Arquivo          metadados: nome, pasta, tipo, tamanho, dono, ACL
#   ArquivoConteudo  o conteúdo, 1:1 com o Arquivo — SEPARADO de propósito
#   ArquivoEvento    auditoria de envio e exclusão (quem, quando)
#
# POR QUE O CONTEÚDO EM OUTRO MODEL: a listagem lê `Arquivo`, e se o conteúdo
# morasse ali uma pasta com 20 arquivos de 5 MB mandaria 100 MB para a tela a
# cada carga. Com os dois separados, listar é leve e o conteúdo só sai quando
# alguém baixa um arquivo específico.
#
# ACERVO SEPARADO, de propósito: arquivo de apoio (script, manual, material de
# homologação) NÃO é anexo de chamado. Misturar faria material interno aparecer
# na timeline de um chamado e vice-versa.
#
# ⚠️ LIMITE HERDADO DA PLATAFORMA: o conteúdo mora no próprio registro, como
# data URI — é o que os anexos de chamado já fazem, porque a rota de upload da
# plataforma é um stub 501 (ver app/lib/anexos.ts). Isso dá um teto prático de
# 10 MB por arquivo. Para material de homologação maior que isso, o caminho é
# storage de verdade com URL assinada, que é conversa de plataforma e não deste
# script.
#
# Uso:
#   python3 scripts/arquivos-modelo.py              # simula
#   python3 scripts/arquivos-modelo.py --aplicar    # escreve
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


ARQUIVO = {
    "name": "portal-suporte-Arquivo",
    "alias": "Arquivo",
    "schema": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "nome": {"type": "string"},
            # Caminho simples, uma barra por nível: "scripts/sgc". Sem model de
            # pasta: pasta vazia não é informação, e o que importa é agrupar.
            "pasta": {"type": "string"},
            "tipo": {"type": "string"},
            # Tamanho em bytes, MEDIDO no servidor a partir do conteúdo — o que
            # a tela declara não vale.
            "tamanho": {"type": "number"},
            "dono_id": {"type": "string"},
            # Quem pode ver: nível mínimo E/OU um grant. Vazio nos dois = todo
            # mundo da equipe (nível support, que é a régua de entrada).
            "acl_nivel": {"type": "string"},
            "acl_grant": {"type": "string"},
            "criado_em": {"type": "string"},
            # Estado FILTRÁVEL, string ("sim"/"nao"), porque é por ele que a
            # listagem filtra em vez de VARRER. String e não booleano por
            # cautela: o filtro de campo desta plataforma só foi medido com
            # string, e a listagem é justamente o lugar onde não dá para
            # depender de um filtro que talvez não case.
            "ativo": {"type": "string"},
            # Diz que o blob foi removido — distingue "apagado de propósito" de
            # "conteúdo que se perdeu".
            "conteudo_removido": {"type": "boolean"},
            # Exclusão é LÓGICA: a auditoria precisa ter a que apontar, e
            # "quem apagou o quê" não serve se o registro do quê desapareceu.
            # A listagem esconde quem não tem `ativo: "sim"`.
            "apagado_em": {"type": "string"},
            "apagado_por": {"type": "string"},
            "created_at": {"type": "string"},
        },
    },
}

CONTEUDO = {
    "name": "portal-suporte-ArquivoConteudo",
    "alias": "ArquivoConteudo",
    "schema": {
        "type": "object",
        "properties": {
            # O MESMO id do Arquivo: 1:1, sem busca por campo para relacionar.
            "id": {"type": "string"},
            "arquivo_id": {"type": "string"},
            # data URI. Ver o aviso sobre o teto no topo.
            "conteudo": {"type": "string"},
            "created_at": {"type": "string"},
        },
    },
}

EVENTO = {
    "name": "portal-suporte-ArquivoEvento",
    "alias": "ArquivoEvento",
    "schema": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "arquivo_id": {"type": "string"},
            # `enviado` | `apagado`. Listar e baixar NÃO geram evento: a tabela
            # cresceria a cada carga de tela e a auditoria viraria ruído.
            "acao": {"type": "string"},
            "por": {"type": "string"},
            "nome": {"type": "string"},
            "quando": {"type": "string"},
            "created_at": {"type": "string"},
        },
    },
}


def req(url, key, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": key}
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
    api, key = env()
    models = f"{api}/v1/apps/portal-suporte/models"

    c, d = req(models, key)
    if c >= 300 or not isinstance(d, dict):
        print(f"! HTTP {c} ao listar os models: {d}")
        sys.exit(1)
    por_nome = {m["name"] for m in d.get("models", [])}

    faltam = [m for m in (ARQUIVO, CONTEUDO, EVENTO) if m["name"] not in por_nome]
    for m in (ARQUIVO, CONTEUDO, EVENTO):
        print(("→ criar  " if m in faltam else "= existe ") + m["alias"])

    if not faltam:
        print("\n   nada a fazer.")
        return

    print(f"\n   PLANO: criar {len(faltam)} model(s). Nenhum registro existente é tocado.")
    print("   Os anexos de chamado NÃO são migrados nem lidos: são outro acervo.")
    if not aplicar:
        print("\n   (simulação — nada foi enviado. Use --aplicar para escrever.)")
        return

    for m in faltam:
        c, r = req(models, key, "POST", m)
        print(f"   {m['alias']}: HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            sys.exit(1)

    print("""
   ✓ models criados.

   CAMINHO DE VOLTA: apagar os três models. Nada mais foi alterado — nenhum
   chamado, conversa ou anexo é tocado.

   ⚠️ Apagar o model ArquivoConteudo APAGA os arquivos guardados, porque o
   conteúdo mora no registro. Antes de desfazer com arquivos já enviados,
   baixe o que importa.
""")


if __name__ == "__main__":
    main()
