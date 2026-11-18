#!/usr/bin/env python3
# =============================================================================
# Tira as três sondas provisórias de outubro do WhatsApp (17/11/2026).
#
#   diag_eco    (15/10)  POST /whatsapp/inbound   forma do eco de mensagem nossa
#   diag_envio  (19/10)  POST /whatsapp           forma da resposta do envio
#   diag_tempo  (20/10)  GET /whatsapp            tempos por etapa da lista
#                        GET /whatsapp/:id/messages  e da conversa aberta
#
# E, em GET /whatsapp/diagnostico/midia, a leitura delas (`eco`, `eco_total`,
# `envio`, `envio_total`, `tempos`). O resto da rota de diagnóstico fica.
#
# Cada remoção desfaz o que o PR da sonda acrescentou: as chamadas de envio
# voltam a `return { ok: true }`, como antes da sonda.
#
# Edita o routes.generated.ts do repositório; o deploy é o merge.
#
#   python3 scripts/whatsapp-tira-sondas-outubro.py            # simula
#   python3 scripts/whatsapp-tira-sondas-outubro.py --gravar   # grava
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


def bloco(codigo, inicio, fim):
    """O trecho de `inicio` até o primeiro `fim` depois dele, inclusive.
    `inicio` tem de aparecer uma vez só."""
    if codigo.count(inicio) != 1:
        return None
    a = codigo.index(inicio)
    b = codigo.find(fim, a)
    if b < 0:
        return None
    return codigo[a:b + len(fim)]


SONDA_TEMPOS = ("// ── SONDA PROVISÓRIA: onde o tempo da rota vai (20/10/2026)", "  } catch (e) {}\n}\n\n")
SONDA_ENVIO = ("// ── SONDA PROVISÓRIA: a forma da resposta do envio (19/10/2026)", "  } catch (e) {}\n}\n\n")
SONDA_ECO = ("  // ── Sonda do anexo duplicado (15/10/2026, para um dia)", "    } catch (e) {}\n  }\n")
LEITURA_448 = ("  // ── Capturas da sonda do eco (15/10/2026)",
               "  _tempos.sort(function (a, b) { return String(a.created_at) < String(b.created_at) ? 1 : -1; });\n")


def trocas_da_rota(chave, codigo):
    """Lista de (de, para) no código decodificado, ou uma mensagem de erro."""
    t = []
    if chave in ("GET /whatsapp", "GET /whatsapp/:id/messages"):
        b = bloco(codigo, *SONDA_TEMPOS)
        if not b or "async function _sondaTempos" not in b or "async function handler" in b:
            return "bloco da sonda de tempos fora do formato"
        t.append((b, ""))
        t.append(("  var _t0 = Date.now(), _tp = {};\n", ""))
        rota, limite = ("lista", 3000) if chave == "GET /whatsapp" else ("conversa", 2000)
        for linha in re.findall(r"^  _tp\.[^\n]*\n", codigo, re.M):
            t.append((linha, ""))
        t.append(('  _sondaTempos(ctx, "%s", _tp, %d).catch(function () {});\n' % (rota, limite), ""))
    elif chave == "POST /whatsapp":
        b = bloco(codigo, *SONDA_ENVIO)
        if not b or "async function _sondaEnvio" not in b or "function _formaDoValor" not in b:
            return "bloco da sonda do envio fora do formato"
        t.append((b, ""))
        for rota in ('rota.replace("/actions/", "")', '"sendMessageGroup"', '"sendMessage"'):
            t.append(("{ await _sondaEnvio(ctx, %s, r); return { ok: true }; }" % rota, "return { ok: true };"))
    elif chave == "POST /whatsapp/inbound":
        b = bloco(codigo, *SONDA_ECO)
        if not b or "kind: \"diag_eco\"" not in b or not b.rstrip("\n").endswith("}"):
            return "bloco da sonda do eco fora do formato"
        if not codigo[codigo.index(b) + len(b):].startswith("  if (!_casou && Msg && message) {"):
            return "o bloco da sonda do eco não termina onde devia"
        t.append((b, ""))
    elif chave == "GET /whatsapp/diagnostico/midia":
        b = bloco(codigo, *LEITURA_448)
        if not b or "diag_tempo_lista" not in b or "diag_envio" not in b:
            return "leitura das sondas no diagnóstico fora do formato"
        t.append((b, ""))
        for campo in ("    eco_total: _eco.length,\n", "    eco: _eco.slice(0, 30),\n",
                      "    envio_total: _envio.length,\n", "    envio: _envio.slice(0, 6),\n",
                      "    tempos: _tempos.slice(0, 16),\n"):
            t.append((campo, ""))
    return t


ROTAS = {"GET /whatsapp", "GET /whatsapp/:id/messages", "POST /whatsapp",
         "POST /whatsapp/inbound", "GET /whatsapp/diagnostico/midia"}
# Nada disto pode sobrar nas rotas depois da remoção.
RESTOS = ("_sondaTempos", "_diagTempoCompleto", "_tp", "_t0", "_sondaEnvio", "_diagEnvioCompleto",
          "_formaDoValor", "diag_eco", "diag_envio", "diag_tempo", "_EvEco", "_eco", "_envio", "_tempos")


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
        if chave not in ROTAS:
            continue
        if chave in vistas:
            erros.append(f"{chave}: aparece mais de uma vez")
            continue
        vistas.add(chave)
        enc = m.group(2)
        codigo = json.loads('"' + enc + '"')
        if not any(r in codigo for r in ("_sondaTempos", "_sondaEnvio", "diag_eco", "diag_envio", "diag_tempo")):
            print(f"   {chave}: já sem as sondas")
            continue
        trocas = trocas_da_rota(chave, codigo)
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
            sobra = [r for r in RESTOS if re.search(r"(?<![\w$])" + re.escape(r) + r"(?![\w$])", esperado)
                     or (r.startswith("diag_") and r in esperado)]
            if sobra:
                erros.append(f"{chave}: sobrou {sobra}")
                continue
            print(f"   {chave}: {len(trocas)} trecho(s) removido(s), {len(codigo) - len(esperado)} caracteres")
            pedacos.append(texto[fim:m.start(2)])
            pedacos.append(novo)
            fim = m.end(2)

    faltam = ROTAS - vistas
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
