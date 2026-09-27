// =============================================================================
// Empresa: quem está cadastrada, e como reconhecer o nome que veio digitado.
//
// O cadastro tem 142 linhas, mas só 20 são cadastro de verdade. As outras 122
// têm `synced_from_tickets: true` — nasceram de uma carga que varreu o texto
// livre do campo Empresa dos chamados antigos. É por isso que convivem
// "Shopping da Utilidade - Americana", "Shopping da Utilidade Americana" e
// "Shopping Util Americana" como se fossem clientes diferentes.
//
// Duas decisões saem daqui:
//
// 1. Onde se ESCOLHE uma empresa (abrir chamado, filtrar), só aparecem as
//    cadastradas. Oferecer as 122 é oferecer o erro pronto.
//
// 2. Onde se LÊ um chamado antigo, o nome digitado precisa achar a empresa
//    certa — senão o histórico some do filtro. `resolver()` normaliza e
//    também tenta os apelidos (`name_aliases`), que é o campo previsto para
//    registrar as grafias que já circularam.
//
// O chamado guarda `company_name` como texto, não `company_id`. Enquanto isso
// não mudar, reconhecer pelo nome não é gambiarra: é a única chave que existe.
// =============================================================================

export type EmpresaBruta = {
  id: string
  name: string
  tradeName?: string | null
  trade_name?: string | null
  cnpj?: string | null
  active?: boolean
  synced_from_tickets?: boolean
  name_aliases?: string[] | null
}

/** Sem acento, sem pontuação e sem espaço: "2 a 20" casa com "2a20". */
export function chaveEmpresa(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Cadastro de verdade — o que pode ser escolhido. */
export function ehCadastrada(c: EmpresaBruta): boolean {
  return !c.synced_from_tickets
}

/** Todo nome pelo qual uma empresa pode aparecer num chamado antigo. */
function grafias(c: EmpresaBruta): string[] {
  return [c.name, c.tradeName ?? c.trade_name ?? '', ...(c.name_aliases ?? [])]
    .map((t) => chaveEmpresa(String(t)))
    .filter(Boolean)
}

export type IndiceEmpresas = Map<string, EmpresaBruta>

/**
 * Índice das CADASTRADAS por todas as suas grafias. As vindas de chamado ficam
 * de fora de propósito: elas são o sintoma, não a referência.
 */
export function indexar(empresas: EmpresaBruta[]): IndiceEmpresas {
  const idx: IndiceEmpresas = new Map()
  for (const c of empresas.filter(ehCadastrada)) {
    for (const g of grafias(c)) if (!idx.has(g)) idx.set(g, c)
  }
  return idx
}

/**
 * Do nome escrito no chamado para a empresa cadastrada.
 *
 * Casa exato pela chave normalizada e, se não achar, por prefixo/contido —
 * é o que liga "Shopping Util Americana" a "Shopping da Utilidade - Americana".
 * A busca por contido exige 6 caracteres para não colar "Casa Lar" em
 * "Casa Lar Utilidades" por acidente de duas letras.
 */
export function resolver(nome: string | null | undefined, idx: IndiceEmpresas): EmpresaBruta | null {
  const k = chaveEmpresa(nome ?? '')
  if (!k) return null
  const exato = idx.get(k)
  if (exato) return exato
  if (k.length < 6) return null
  for (const [grafia, empresa] of idx) {
    if (grafia.length >= 6 && (grafia.includes(k) || k.includes(grafia))) return empresa
  }
  return null
}

/** Rótulo estável para agrupar/filtrar: nome da cadastrada, ou o texto cru. */
export function rotuloEmpresa(nome: string | null | undefined, idx: IndiceEmpresas): string {
  return resolver(nome, idx)?.name ?? (nome || '(Sem empresa)')
}
