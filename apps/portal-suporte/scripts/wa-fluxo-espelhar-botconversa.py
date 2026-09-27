#!/usr/bin/env python3
# =============================================================================
# Reescreve o fluxo do portal igual ao que está no ar no BotConversa.
#
# Fonte: `[Arara Tech] - Atendimento Normal(1)`, fluxo 9190497 do bot 128559,
# lido em 17/08/2026 pela API do próprio BotConversa
# (`GET /api/v1/blocks/flow/9190497/`), 32 blocos.
#
# O que estava diferente no portal (16 nós, 8 menus) e agora não está mais:
#
#   menu de suporte      faltavam "Dúvidas sobre notas fiscais" e "Configuração
#                        de impressora"; sobrava "Outro assunto"
#   menu do SGI/SGC      3 opções contra 5 (faltavam Usuários e Estoque, e
#                        "Relatórios fiscais" era na verdade "Notas fiscais")
#   NFC-e                o submenu inteiro não existia — é ele que separa
#                        problema de TEF/Sitef (que é da Fiserv) de erro de
#                        emissão (que é nosso)
#   horário comercial    o BotConversa decide por horário em DOIS pontos, e o
#                        portal não tinha nenhum: fora do expediente a resposta
#                        é outra
#   espera de 5 min      antes de passar para o grupo Suporte, dentro do horário
#
# Equivalências de bloco (BotConversa → portal), porque os editores não têm o
# mesmo vocabulário:
#
#   ação "transferir conversa p/ grupo Suporte" (tipo 25) → nó `handoff`
#   ação "etiqueta Administrativo" (tipo 0)               → `handoff` administrativo
#   condição "horário comercial"                          → nó `condition`
#   atraso inteligente 5 min                              → nó `delay`
#   ação "encerrar atendimento" (tipo 30)                 → sem equivalente;
#       vira aresta direta para o destino seguinte, com o texto preservado
#
#   python3 scripts/wa-fluxo-espelhar-botconversa.py            # simula
#   python3 scripts/wa-fluxo-espelhar-botconversa.py --aplicar  # grava rascunho
#   python3 scripts/wa-fluxo-espelhar-botconversa.py --publicar # grava e publica
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLUXO = "waf_ms4r57w6mpdr30"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
RT = f"{API}/v1/r/portal-suporte"

# ── Nós ──────────────────────────────────────────────────────────────────────
# Textos copiados literalmente do BotConversa, inclusive a grafia (mantida de
# propósito: divergir aqui é o começo de os dois fluxos separarem de novo).
NOS = [
    # O rótulo diz "Início" porque, com 24 cards e vários laços, achar por
    # onde a conversa começa não pode depender de reparar na posição.
    ("root", "menu", "INÍCIO — Atendimento Arara Tech",
     "Olá, tudo bom com você? Como posso ajudar?",
     [("suporte", "Preciso de Suporte da AraraTech"),
      ("admin", "Quero falar com AraraTech Administrativo, Financeiro."),
      ("vendas", "Quero falar com a área de Vendas da AraraTech")]),

    ("suporte", "menu", "Assunto do suporte",
     "Qual dessas opções melhor descreve o que você precisa?",
     [("notas", "Duvidas sobre notas fiscais"),
      ("pdv", "Suporte para PDV"),
      ("sgi", "Suporte para SGI / SGC"),
      ("etiquetas", "Suporte para sistema de etiquetas"),
      ("buscapreco", "Suporte para sistema Busca Preço"),
      ("instalacao", "Agendar uma instalação"),
      ("impressora", "Configuração de impressora")]),

    ("sup_pdv", "menu", "Erro no PDV",
     "Certo, para agilizar o atendimento, por favor selecione qual o erro apresentado no PDV:",
     [("nfce", "Erro ao emitir cupons fiscais (NFC-e)"),
      ("retransmitir", "Erro ao retransmitir notas fiscais"),
      ("atualizar", "Erro ao atualizar o PDV"),
      ("login", "Erro ao fazer login de usuario"),
      ("caixa", "Erro de fechamento/abertura de caixa"),
      ("tributacao", "Erro de tributação"),
      ("ncm", "Erro de NCM")]),

    ("pdv_nfce", "menu", "Cupom fiscal (NFC-e)",
     "Sobre o Erro de emitir cupons fiscais (NFC-es) você:",
     [("tef", "Estou com problemas na parte de pagamento, TEF/Skytef/Sitef não está passando"),
      ("emissao", "Estou com erro na emissão do cupom fiscal (NFC-e)")]),

    ("sup_etiquetas", "menu", "Sistema de etiquetas",
     "Referente ao sistema de etiquetas, como posso te ajudar?",
     [("nenhuma", "Nenhuma impressora imprime"),
      ("invertidas", "Imprimindo as etiquetas invertidas")]),

    ("sup_buscapreco", "menu", "Servidor BuscaPreço",
     "Como posso te ajudar com o servidor BuscaPreço?",
     [("atualizacao", "Está com erro de atualização"),
      ("terminais", "Está com erro nos terminais")]),

    ("sup_instalacao", "menu", "Instalação de PDV",
     "O serviço de Instalação e Configuração de PDV possui o valor de R$ 90,60 por máquina.\n\n"
     "Gostaríamos de saber se autoriza a realização da instalação.\n\n"
     "Estamos à disposição para agendamentos.",
     [("autorizo", "Autorizo e desejo agendar a instalação"),
      ("muitos", "Preciso de muitos PDVs, prefiro falar com o time de vendas.")]),

    ("sup_sgi", "menu", "SGI / SGC",
     "Sobre o SGI / SGC, como podemos te ajudar?",
     [("notas", "Notas fiscais"),
      ("usuarios", "Usuários"),
      ("estoque", "Estoque"),
      ("financeiros", "Relatórios financeiros"),
      ("fora_do_ar", "Sistema fora do ar")]),

    ("resolveu", "menu", "Encerramento",
     "Tem algo mais que possa ajudar?",
     [("tudo_certo", "Tudo certo por hora, Obrigado"),
      ("nao_resolveu", "Ainda não resolveu, estou com o mesmo erro"),
      ("outro", "Tenho outro erro")]),

    ("msg_detalhar", "content", "Pedir detalhes",
     "Certo, poderia detalhar melhor qual seria a sua duvida, como podemos ajudar? \n\n"
     "Também pedimos que envie um print da tela e/ou evidencias do erro com um audio ou video "
     "para que possamos analisar e te ajudar com maior precisão.\n\n"
     "Vou direcionar para um de nossos analistas te ajudar com isso em breve.", None),

    ("msg_print", "content", "Pedir print",
     "Certo, poderia por favor me envie print screen ou foto legível do erro que aparece? \n\n"
     "Vou chamar um analista para acessar o caixa e verificar para você nos proximos minutos.", None),

    ("sol_atualizar", "content", "Atualização completa",
     "Certo, nesse caso para resolver basta fazer uma atualização completa do sistema.\n\n"
     "Basta inutilizar a venda, e voltar à tela inicial do PDV.\n\n"
     "Feche o sistema e abra novamente, \n\n"
     "Na tela inicial faça uma atualização completa do PDV.\n\n"
     "[imagem do passo a passo]", None),

    ("sol_bobina", "content", "Inverter bobina",
     "Certo, nesse caso basta inverter as bobinas de etiquetas", None),

    ("sol_terminais", "content", "Reiniciar terminais",
     "Certo, nesse caso basta reiniciar os terminais para sincronizar com o servidor.\n\n"
     "Por favor, desligue o terminal, desconecte o cabo de rede e o cabo de energia. "
     "Apos 20 segundos ligue o terminal novamente.\n\n"
     "Assim que finalizar, poderia confirmar se foi normalizado?", None),

    ("msg_dados_instalacao", "content", "Dados para instalação",
     "Para iniciar a instalação preciso que me envie:\n\n"
     "Nome da loja:\nNumero do caixa:\nAnydesk do caixa:\n"
     "Foto exibindo a marca/modelo da impressora:", None),

    ("msg_fora_do_ar", "content", "Sistema fora do ar",
     "Certo, pedimos desculpas pela inatividade e agradecemos por nos avisar. \n"
     "Já acionarei um analista para verificar a situação e retornar aqui o mais rapido possível.\n\n"
     "Poderia, por favor, enviar um print screen ou foto da tela mostrando o endereço que está offline? \n"
     "Assim conseguimos registrar corretamente a ocorrência e agilizar a análise.", None),

    ("msg_tef", "content", "TEF é com a Fiserv",
     "Entendi, nos casos que de erro relacionado à parte de pagamento via TEF, recomendamos que "
     "entre em contato diretamente com o suporte da Fiserv/Skytef deles, pois esse tipo de erro "
     "deve ser tratado por eles, certo?", None),

    ("msg_encerrado", "content", "Encerrado",
     "Tempo de atendimento sem resposta atingido, Se precisar de algo mais, estaremos aqui.\n"
     "Agradecemos seu contato! \nO time AraraTech deseja excelentes vendas!", None),

    ("msg_fora_horario", "content", "Fora do horário",
     "Nosso horario de atendimento é de Seg a Sex, das 09 as 18hs, exceto feriados. \n"
     "Mas já notifiquei o nosso time pra te responder aqui o mais breve possível.", None),

    # Condições de horário comercial — os dois pontos em que o BotConversa
    # decide, e que o portal não tinha.
    ("cond_horario_suporte", "condition", "É horário comercial?",
     "Seg a Sex, das 09h às 18h (exceto feriados)", None),
    ("cond_horario_humano", "condition", "É horário comercial?",
     "Seg a Sex, das 09h às 18h (exceto feriados)", None),

    ("espera", "delay", "Aguardar 5 min", "Espera antes de passar para o grupo Suporte.", None),

    ("hand_suporte", "handoff", "Atendente — Suporte",
     "Vou direcionar para um de nossos analistas te ajudar com isso em breve.", None),
    ("hand_admin", "handoff", "Atendente — Administrativo",
     "Legal, já notifiquei o time humano aqui, você terá uma resposta em breve. Obrigado", None),
]

AREA = {"hand_suporte": "suporte", "hand_admin": "administrativo"}
SEGUNDOS = {"espera": 300}

# ── Arestas ──────────────────────────────────────────────────────────────────
# (origem, porta, destino)
ARESTAS = [
    ("root", "opt:suporte", "suporte"),
    ("root", "opt:admin", "cond_horario_humano"),
    ("root", "opt:vendas", "cond_horario_humano"),

    ("suporte", "opt:notas", "msg_detalhar"),
    ("suporte", "opt:pdv", "sup_pdv"),
    ("suporte", "opt:sgi", "sup_sgi"),
    ("suporte", "opt:etiquetas", "sup_etiquetas"),
    ("suporte", "opt:buscapreco", "sup_buscapreco"),
    ("suporte", "opt:instalacao", "sup_instalacao"),
    ("suporte", "opt:impressora", "msg_print"),

    ("sup_pdv", "opt:nfce", "pdv_nfce"),
    ("sup_pdv", "opt:retransmitir", "msg_print"),
    ("sup_pdv", "opt:atualizar", "msg_print"),
    ("sup_pdv", "opt:login", "sol_atualizar"),
    ("sup_pdv", "opt:caixa", "msg_print"),
    ("sup_pdv", "opt:tributacao", "sol_atualizar"),
    ("sup_pdv", "opt:ncm", "sol_atualizar"),

    ("pdv_nfce", "opt:tef", "msg_tef"),
    ("pdv_nfce", "opt:emissao", "msg_print"),

    ("sup_etiquetas", "opt:nenhuma", "msg_print"),
    ("sup_etiquetas", "opt:invertidas", "sol_bobina"),

    ("sup_buscapreco", "opt:atualizacao", "msg_print"),
    ("sup_buscapreco", "opt:terminais", "sol_terminais"),

    ("sup_instalacao", "opt:autorizo", "msg_dados_instalacao"),
    ("sup_instalacao", "opt:muitos", "cond_horario_humano"),

    ("sup_sgi", "opt:notas", "msg_detalhar"),
    ("sup_sgi", "opt:usuarios", "msg_detalhar"),
    ("sup_sgi", "opt:estoque", "msg_detalhar"),
    ("sup_sgi", "opt:financeiros", "msg_detalhar"),
    ("sup_sgi", "opt:fora_do_ar", "msg_fora_do_ar"),

    # Coletou a informação → decide pelo horário.
    ("msg_detalhar", "next", "cond_horario_suporte"),
    ("msg_print", "next", "cond_horario_suporte"),
    ("msg_dados_instalacao", "next", "cond_horario_suporte"),
    ("msg_fora_do_ar", "next", "cond_horario_suporte"),

    # Soluções de autoatendimento → pergunta se resolveu.
    ("sol_atualizar", "next", "resolveu"),
    ("sol_bobina", "next", "resolveu"),
    ("sol_terminais", "next", "resolveu"),
    ("msg_tef", "next", "resolveu"),

    ("resolveu", "opt:tudo_certo", "msg_encerrado"),
    ("resolveu", "opt:nao_resolveu", "cond_horario_suporte"),
    # "Tenho outro erro" encerra o atendimento e volta ao menu de suporte.
    ("resolveu", "opt:outro", "suporte"),

    ("cond_horario_suporte", "true", "espera"),
    ("cond_horario_suporte", "false", "hand_suporte"),
    ("espera", "next", "hand_suporte"),

    ("cond_horario_humano", "true", "hand_admin"),
    ("cond_horario_humano", "false", "msg_fora_horario"),
]


LARGURA_COLUNA = 340
RESPIRO = 28


def altura(tipo, texto, opcoes):
    """Mesma estimativa de `lib/wa-flow-graph.ts` — cabeçalho, texto e uma
    linha por opção. Altura fixa fazia os cards colidirem."""
    base = 34 + 24
    if tipo == "menu":
        linhas = min(3, -(-len(texto) // 42))
        return base + linhas * 16 + len(opcoes or []) * 30
    if tipo == "condition":
        return base + 16 + 2 * 28
    if tipo == "delay":
        return base + 16
    linhas = min(4, -(-len(texto) // 42))
    return base + linhas * 16 + (18 if tipo == "handoff" else 0)


def montar():
    porNo = {n[0]: n for n in NOS}
    saidas = {}
    for origem, porta, destino in ARESTAS:
        saidas.setdefault(origem, []).append(destino)

    # Ordem cronológica: largura primeiro a partir da raiz. A COLUNA é a
    # distância até o início, então ler da esquerda para a direita é ler a
    # conversa na ordem em que ela acontece — que é justamente o que a grade
    # arbitrária da primeira versão embaralhava.
    profundidade = {"root": 0}
    ordem = []
    fila = ["root"]
    while fila:
        atual = fila.pop(0)
        ordem.append(atual)
        for destino in saidas.get(atual, []):
            if destino in profundidade:
                continue  # já colocado numa coluna anterior; volta de laço não reposiciona
            profundidade[destino] = profundidade[atual] + 1
            fila.append(destino)
    # Nada pode sumir do mapa: o que não for alcançado vai para uma coluna extra.
    solto = [n[0] for n in NOS if n[0] not in profundidade]
    for nid in solto:
        profundidade[nid] = max(profundidade.values()) + 1
        ordem.append(nid)

    rotulo = {}
    nos = []
    proximoY = {}
    for passo, nid in enumerate(ordem, start=1):
        _, tipo, label, texto, opcoes = porNo[nid]
        # Número no cabeçalho: com 24 cards e vários laços, dizer "onde isso
        # começa" só com a posição não basta.
        data = {"label": f"{passo}. {label}", "text": texto}
        if opcoes:
            data["options"] = [{"id": oid, "label": ot} for oid, ot in opcoes]
            for oid, ot in opcoes:
                rotulo[(nid, f"opt:{oid}")] = ot
        if nid in AREA:
            data["area"] = AREA[nid]
        if nid in SEGUNDOS:
            data["seconds"] = SEGUNDOS[nid]
        if tipo == "condition":
            data["check"] = texto

        col = profundidade[nid]
        y = proximoY.get(col, 0)
        proximoY[col] = y + altura(tipo, texto, opcoes) + RESPIRO
        nos.append({
            "id": nid, "type": tipo,
            "position": {"x": col * LARGURA_COLUNA, "y": y},
            "data": data,
        })

    ids = {n["id"] for n in nos}
    arestas = []
    for origem, porta, destino in ARESTAS:
        if origem not in ids or destino not in ids:
            raise SystemExit(f"aresta inválida: {origem} → {destino}")
        a = {"id": f"{origem}--{porta}--{destino}", "source": origem,
             "target": destino, "sourceHandle": porta}
        if (origem, porta) in rotulo:
            a["label"] = rotulo[(origem, porta)]
        arestas.append(a)

    return {"root": "root", "nodes": nos, "edges": arestas}


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    grafo = montar()
    menus = [n for n in grafo["nodes"] if n["type"] == "menu"]
    print(f"→ {len(grafo['nodes'])} nós ({len(menus)} menus), {len(grafo['edges'])} arestas")
    for m in menus:
        print(f"   {m['id']}: {len(m['data']['options'])} opções")

    if "--aplicar" not in sys.argv and "--publicar" not in sys.argv:
        print("\n   (simulação — use --aplicar ou --publicar)")
        return

    c, d = req(f"{RT}/whatsapp/flows/{FLUXO}", "PATCH", {"graph": grafo})
    print(f"→ gravar rascunho: HTTP {c} {'' if c < 300 else d}")
    if c >= 300:
        sys.exit(1)
    if "--publicar" in sys.argv:
        c, d = req(f"{RT}/whatsapp/flows/{FLUXO}/publish", "POST", {})
        print(f"→ publicar: HTTP {c} {json.dumps(d, ensure_ascii=False) if c < 300 else d}")


if __name__ == "__main__":
    main()
