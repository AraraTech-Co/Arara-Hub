'use client'

// =============================================================================
// Empresas — lista completa, carregada uma vez e filtrada aqui.
//
// Dois defeitos motivaram esta forma:
//
// 1. `GET /admin/companies` devolve **50** por padrão, e há 142 cadastradas.
//    Quem abria o seletor não achava o cliente, concluía que não existia e
//    digitava o nome à mão — é a origem de "2a20", "2 à 20 Utilidades" e
//    "Shopping Util Americana" convivendo como empresas diferentes.
//
// 2. A busca do servidor não normaliza: `2a20` devolve 12 resultados e
//    `2 a 20` devolve 1. Quem digita com espaço não acha.
//
// São 142 registros — buscar tudo custa uma requisição e resolve os dois. O
// cache é de módulo para o seletor não refazer a chamada a cada montagem.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { companiesApi, type Company } from '@/lib/api/companies'
import { chaveEmpresa, ehCadastrada, indexar, type EmpresaBruta } from '@/lib/empresas'

export { chaveEmpresa }

/** Acima do total cadastrado com folga; a rota corta em 50 se não pedirmos. */
const TUDO = 1000

let cache: Company[] | null = null
let emVoo: Promise<Company[]> | null = null

async function carregarTodas(): Promise<Company[]> {
  if (cache) return cache
  if (!emVoo) {
    emVoo = companiesApi
      .list({ limit: TUDO })
      .then((r) => {
        cache = r.data ?? []
        return cache
      })
      .finally(() => {
        emVoo = null
      })
  }
  return emVoo
}

/** Descarta o cache — usar depois de cadastrar ou editar uma empresa. */
export function invalidarEmpresas() {
  cache = null
}

/**
 * @param apenasCadastradas  padrão `true`: só as do cadastro real. As 122 com
 *   `synced_from_tickets` nasceram do texto livre de chamados antigos e não
 *   podem ser oferecidas para escolha — é delas que vem a duplicação. Passe
 *   `false` na administração, que precisa mostrar os dois grupos.
 */
export function useCompanies(params?: {
  search?: string
  limit?: number
  apenasCadastradas?: boolean
}) {
  const [todas, setTodas] = useState<Company[]>(cache ?? [])
  const [loading, setLoading] = useState(!cache)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTodas(await carregarTodas())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar empresas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const soCadastradas = params?.apenasCadastradas !== false

  const cadastradas = useMemo(
    () => todas.filter((c) => ehCadastrada(c as EmpresaBruta)),
    [todas],
  )
  const deChamados = useMemo(
    () => todas.filter((c) => !ehCadastrada(c as EmpresaBruta)),
    [todas],
  )
  const indice = useMemo(() => indexar(todas as EmpresaBruta[]), [todas])

  const companies = useMemo(() => {
    const base = soCadastradas ? cadastradas : todas
    const q = chaveEmpresa(params?.search ?? '')
    if (!q) return base
    // Casa no nome, no nome fantasia e nos apelidos — é assim que um chamado
    // antigo com o nome errado ainda encontra a empresa certa.
    return base.filter((c) => {
      const alvos = [c.name, c.tradeName ?? '', ...(((c as { name_aliases?: string[] }).name_aliases) ?? [])]
      return alvos.some((t) => chaveEmpresa(String(t)).includes(q))
    })
  }, [todas, cadastradas, soCadastradas, params?.search])

  return {
    companies,
    /** Só o cadastro real — o que pode ser escolhido. */
    cadastradas,
    /** As que vieram do texto livre de chamados; existem para não perder o histórico. */
    deChamados,
    /** Nome digitado → empresa cadastrada. Ver lib/empresas.ts. */
    indice,
    /** Todas, sem filtro — para quem precisa do total. */
    todas,
    loading,
    error,
    reload: async () => {
      invalidarEmpresas()
      await load()
    },
  }
}
