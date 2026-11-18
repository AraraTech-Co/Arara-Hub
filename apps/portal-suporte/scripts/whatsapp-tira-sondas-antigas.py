#!/usr/bin/env python3
# =============================================================================
# Tira as últimas sondas de diagnóstico da entrada do WhatsApp (18/11/2026).
#
# Em POST /whatsapp/inbound (485):
#   diag_midia             mapa de campos do anexo recebido
#   diag_shape             forma da mensagem sem texto reconhecido
#   diag_grupo_nome        respostas da Avisa quando o nome do grupo não é achado
#   diag_pagina_conversas  falha no meio da leitura paginada das conversas
#
# Em GET /whatsapp/diagnostico/midia (448), sai a leitura do `diag_midia`
# (`total` e `capturas`). A contagem dos avisos ao plantonista fica.
#
# A leitura paginada continua igual: página que falha no meio, ou teto de
# páginas, segue com o que já foi lido. Só deixa de registrar a falha.
#
#   python3 scripts/whatsapp-tira-sondas-antigas.py            # simula
#   python3 scripts/whatsapp-tira-sondas-antigas.py --gravar   # grava
#
# Aborta sem gravar nada se qualquer âncora não estiver no formato esperado.
# =============================================================================

import argparse
import importlib.util
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")

_spec = importlib.util.spec_from_file_location("_ds", os.path.join(RAIZ, "scripts", "desativado-sem-acesso.py"))
_ds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ds)

ENTRADA = "POST /whatsapp/inbound"
DIAGNOSTICO = "GET /whatsapp/diagnostico/midia"
KINDS = ("diag_midia", "diag_shape", "diag_grupo_nome", "diag_pagina_conversas")


def bloco(codigo, inicio, fim):
    """De `inicio` (único) até o primeiro `fim` depois dele, inclusive."""
    if codigo.count(inicio) != 1:
        return None
    a = codigo.index(inicio)
    b = codigo.find(fim, a)
    return None if b < 0 else codigo[a:b + len(fim)]


def trocas_entrada(c):
    t = []
    # diag_grupo_nome: o registro no fim de _nomeDoGrupoAvisa e o `passos` que só ele lia.
    b = bloco(c, "  // Diagnóstico: no máximo 6, só forma da resposta.\n", "  } catch (e) {}\n")
    if not b or 'kind: "diag_grupo_nome"' not in b or not c[c.index(b) + len(b):].startswith("  return null;\n}\n"):
        return "bloco do diag_grupo_nome fora do formato"
    t.append((b, ""))
    t.append(("  var passos = [];\n", ""))
    for linha in re.findall(r"^    passos\.push\(\{ rota: [^\n]*\n", c, re.M):
        t.append((linha, ""))
    t.append(("  } catch (e) {\n    passos.push({ erro: String((e && e.message) || e).slice(0, 120) });\n  }\n",
              "  } catch (e) {}\n"))
    # diag_pagina_conversas: a função e a chamada.
    b = bloco(c, "async function _diagPaginaConversas(ctx, _falha, _lidas) {\n", "  } catch (_e) {}\n}\n")
    if not b or 'kind: "diag_pagina_conversas"' not in b:
        return "bloco do diag_pagina_conversas fora do formato"
    t.append((b, ""))
    t.append(("  if (_pgFalhou) await _diagPaginaConversas(ctx, _pgFalhou, _acc.length);\n", ""))
    # `_pgFalhou` só existia para alimentar o registro: sai junto.
    t.append(("  var _pgFalhou = null;\n", ""))
    t.append(("      _pgFalhou = { pagina: _pk, erro: String((_pe && _pe.message) || _pe) };\n      break;\n",
              "      break;\n"))
    t.append(('    if (_pk === _MAX_PAG_CONV - 1) _pgFalhou = { pagina: _pk, erro: "teto de paginas" };\n', ""))
    t.append(("// páginas atingido, seguem com o que já foi lido e registram a falha.\n",
              "// páginas atingido, seguem com o que já foi lido.\n"))
    # diag_midia
    b = bloco(c, "    // SONDA: guarda o MAPA DE CAMPOS do anexo (nome, tipo, tamanho) — nunca o\n", "      } catch (e) {}\n    }\n\n")
    if not b or 'kind: "diag_midia"' not in b or not c[c.index(b) + len(b):].startswith("    // ── Reação do cliente"):
        return "bloco do diag_midia fora do formato"
    t.append((b, ""))
    # diag_shape: o registro antes do descarte "sem texto"; o descarte fica.
    b = bloco(c, "      // Formato desconhecido: guarda o MAPA DE TIPOS (nome do campo e typeof),\n", "      } catch (e) {}\n")
    if not b or 'kind: "diag_shape"' not in b or not c[c.index(b) + len(b):].startswith('      return ok(ctx, { ignorado: "sem texto" });'):
        return "bloco do diag_shape fora do formato"
    t.append((b, ""))
    return t


def trocas_diagnostico(c):
    return [
        ('  var todos = (await Ev.findMany({})) || [];\n'
         '  var meus = todos.filter(function (x) { return x.kind === "diag_midia"; });\n'
         '  meus.sort(function (a, b) { return String(a.created_at) < String(b.created_at) ? 1 : -1; });\n', ""),
        ("    total: meus.length,\n    capturas: meus.slice(0, 5),\n", ""),
        ("// TEMPORÁRIO — scripts/wa-midia-entrada.py\n",
         "// Contagem dos avisos ao plantonista. A leitura das capturas de mídia saiu em 18/11.\n"),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args()
    texto = open(ARQ, encoding="utf-8").read()
    pedacos, fim, vistas, erros = [], 0, set(), []

    for m in _ds.RE_ENTRADA.finditer(texto):
        met = re.search(r'method:\s*"([^"]+)"', m.group(1))
        cam = re.search(r'path:\s*"([^"]+)"', m.group(1))
        chave = f"{met.group(1)} {cam.group(1)}" if met and cam else None
        if chave not in (ENTRADA, DIAGNOSTICO):
            continue
        if chave in vistas:
            erros.append(f"{chave}: aparece mais de uma vez")
            continue
        vistas.add(chave)
        enc = m.group(2)
        codigo = json.loads('"' + enc + '"')
        if not any(k in codigo for k in KINDS + ("_diagPaginaConversas",)):
            print(f"   {chave}: já sem as sondas")
            continue
        trocas = trocas_entrada(codigo) if chave == ENTRADA else trocas_diagnostico(codigo)
        if isinstance(trocas, str):
            erros.append(f"{chave}: {trocas}")
            continue
        asc = "\\u00" in enc or "\\u2" in enc
        novo, esperado = enc, codigo
        for de, para in trocas:
            if esperado.count(de) != 1:
                erros.append(f"{chave}: âncora não é única: {de[:60]!r}")
                break
            novo = _ds.troca_codificada(novo, de, para, asc)
            esperado = esperado.replace(de, para)
            if novo is None:
                erros.append(f"{chave}: âncora codificada não casou: {de[:60]!r}")
                break
        else:
            if json.loads('"' + novo + '"') != esperado:
                erros.append(f"{chave}: a edição codificada não bate com a pretendida")
                continue
            sobra = [k for k in KINDS + ("_diagPaginaConversas", "_pgFalhou", "passos", '"diag_') if k in esperado]
            if sobra:
                erros.append(f"{chave}: sobrou {sobra}")
                continue
            print(f"   {chave}: {len(trocas)} trecho(s), {len(codigo) - len(esperado)} caracteres a menos")
            pedacos.append(texto[fim:m.start(2)])
            pedacos.append(novo)
            fim = m.end(2)

    faltam = {ENTRADA, DIAGNOSTICO} - vistas
    if faltam:
        erros.append(f"rotas não achadas: {sorted(faltam)}")
    if erros:
        print("\n❌ nada foi gravado:")
        for e in erros:
            print("   " + e)
        sys.exit(1)
    pedacos.append(texto[fim:])
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    open(ARQ, "w", encoding="utf-8").write("".join(pedacos))
    print("   gravado")


if __name__ == "__main__":
    main()
