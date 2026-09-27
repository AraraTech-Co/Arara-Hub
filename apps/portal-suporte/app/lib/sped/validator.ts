// SPED EFD ICMS/IPI validator — parses the flat-text format and returns a
// structured ValidationResult compatible with the existing frontend types.

// ─── Types ───────────────────────────────────────────────────────────────────

export type ValidationStatus = 'APROVADO' | 'COM_AVISOS' | 'COM_ERROS' | 'REPROVADO'

export interface ValidationSummary {
  total_linhas: number
  total_criticos: number
  total_erros: number
  total_avisos: number
  total_issues: number
  status: ValidationStatus
}

export interface ValidationError {
  severity: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO'
  category: string
  bloco: string
  registro: string
  linha: number
  campo: string | null
  code: string
  mensagem: string
  sugestao: string
  technical: string
  raw: string
  valor_encontrado: string | null
  valor_esperado: string | null
}

export interface QuickCheck {
  label: string
  status: 'ok' | 'fail' | 'na'
  detail: string | null
}

export interface BlocoResult {
  bloco: string
  total_registros: number
  total_erros: number
  total_avisos: number
  status: 'ok' | 'error' | 'warning' | 'na'
}

export interface Recommendation {
  registro: string
  titulo: string
  passos: string[]
  erros_relacionados: string[]
}

export interface ValidationResult {
  id: string
  file_name: string
  cnpj: string
  periodo: string
  cod_ver: string
  blocos: Record<string, BlocoResult>
  errors: ValidationError[]
  quick_checks: QuickCheck[]
  schema_info: Array<{ registro: string; campos_esperados: number; campos_encontrados: number; ok: boolean }>
  recommendations: Recommendation[]
  summary: ValidationSummary
  created_at: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Number of pipe-delimited fields expected per key registro (including the
// registro code itself as the first field).
const REGISTRO_SCHEMA: Record<string, number> = {
  '0000': 15, '0001': 2,  '0005': 11, '0010': 11,
  '0100': 12, '0150': 10, '0190': 3,  '0200': 8,
  '0300': 4,  '0305': 4,  '0400': 3,  '0450': 4,
  '0460': 3,  '0500': 8,  '0600': 7,  '0990': 2,
  '9001': 2,  '9900': 3,  '9990': 2,  '9999': 2,
}

// All recognised EFD ICMS/IPI block letters (EFD ECD uses different ones)
const BLOCOS = ['0', '1', 'A', 'B', 'C', 'D', 'E', 'G', 'H', 'K', '9']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseLine(raw: string, numero: number) {
  // Lines look like: |REGISTRO|campo1|campo2|...|
  const trimmed = raw.trim()
  const parts = trimmed.split('|')
  // parts[0] is empty string before first pipe, parts[-1] is empty after last
  const campos = parts.slice(1, parts.length - 1)
  const registro = campos[0] ?? ''
  return { raw: trimmed, numero, registro, campos }
}

function detectBloco(registro: string): string {
  if (!registro) return '?'
  const first = registro[0].toUpperCase()
  return BLOCOS.includes(first) ? first : '?'
}

function isValidDate(s: string): boolean {
  if (!/^\d{8}$/.test(s)) return false
  const day = parseInt(s.slice(0, 2), 10)
  const mon = parseInt(s.slice(2, 4), 10)
  const yr  = parseInt(s.slice(4, 8), 10)
  if (mon < 1 || mon > 12) return false
  if (day < 1 || day > 31) return false
  if (yr < 1990 || yr > 2100) return false
  return true
}

function isValidCnpj(s: string): boolean {
  const d = s.replace(/\D/g, '')
  if (d.length !== 14) return false
  if (/^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    let sum = 0
    let pos = len - 7
    for (let i = len; i >= 1; i--) {
      sum += parseInt(d.charAt(len - i), 10) * pos--
      if (pos < 2) pos = 9
    }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11)
  }
  return calc(12) === parseInt(d.charAt(12), 10) && calc(13) === parseInt(d.charAt(13), 10)
}

function formatPeriodo(dtIni: string, dtFim: string): string {
  if (!dtIni || dtIni.length < 8) return ''
  const mm = dtIni.slice(2, 4)
  const yyyy = dtIni.slice(4, 8)
  const mmFim = dtFim?.slice(2, 4)
  const yyyyFim = dtFim?.slice(4, 8)
  if (mm === mmFim && yyyy === yyyyFim) return `${yyyy}-${mm}`
  return `${yyyy}-${mm} a ${yyyyFim}-${mmFim}`
}

// ─── Main validator ───────────────────────────────────────────────────────────

export function validateSpedBuffer(content: string, fileName: string): ValidationResult {
  const id = crypto.randomUUID()
  const errors: ValidationError[] = []

  // ── Parse ──────────────────────────────────────────────────────────────────
  const rawLines = content.split(/\r?\n/).filter(l => l.trim().length > 0)
  const lines = rawLines.map((raw, i) => parseLine(raw, i + 1))

  // Group by registro code
  const byReg: Record<string, typeof lines> = {}
  for (const ln of lines) {
    if (!byReg[ln.registro]) byReg[ln.registro] = []
    byReg[ln.registro].push(ln)
  }

  // ── Extract header info (0000) ─────────────────────────────────────────────
  const hdr = byReg['0000']?.[0]
  const cnpj    = hdr?.campos[6]  ?? ''
  const dtIni   = hdr?.campos[3]  ?? ''
  const dtFim   = hdr?.campos[4]  ?? ''
  const codVer  = hdr?.campos[1]  ?? ''
  const periodo = formatPeriodo(dtIni, dtFim)

  // ── Structural checks ──────────────────────────────────────────────────────

  // File must open with 0000
  if (lines[0]?.registro !== '0000') {
    errors.push({
      severity: 'CRITICAL', category: 'Estrutura', bloco: '0', registro: lines[0]?.registro ?? '',
      linha: 1, campo: null, code: 'EST001',
      mensagem: 'Arquivo não inicia com registro 0000',
      sugestao: 'O primeiro registro do arquivo deve ser 0000 (identificação do arquivo)',
      technical: `Primeiro registro encontrado: ${lines[0]?.registro ?? 'nenhum'}`,
      raw: lines[0]?.raw ?? '', valor_encontrado: lines[0]?.registro ?? null, valor_esperado: '0000',
    })
  }

  // File must close with 9999
  const lastLine = lines[lines.length - 1]
  if (lastLine?.registro !== '9999') {
    errors.push({
      severity: 'CRITICAL', category: 'Estrutura', bloco: '9', registro: lastLine?.registro ?? '',
      linha: lines.length, campo: null, code: 'EST002',
      mensagem: 'Arquivo não termina com registro 9999',
      sugestao: 'O último registro deve ser 9999 (encerramento do arquivo)',
      technical: `Último registro encontrado: ${lastLine?.registro ?? 'nenhum'}`,
      raw: lastLine?.raw ?? '', valor_encontrado: lastLine?.registro ?? null, valor_esperado: '9999',
    })
  }

  // 9999 QTD must equal total lines
  const reg9999 = byReg['9999']?.[0]
  if (reg9999) {
    const declaredCount = parseInt(reg9999.campos[1] ?? '0', 10)
    if (declaredCount !== lines.length) {
      errors.push({
        severity: 'ERROR', category: 'Totalizador', bloco: '9', registro: '9999',
        linha: reg9999.numero, campo: 'QTD_LIN_SF',
        code: 'EST005',
        mensagem: `Totalizador de linhas divergente: declarado ${declaredCount}, encontrado ${lines.length}`,
        sugestao: 'Verifique se o arquivo não foi editado manualmente ou truncado',
        technical: `9999.QTD_LIN_SF=${declaredCount} vs linhas reais=${lines.length}`,
        raw: reg9999.raw,
        valor_encontrado: String(declaredCount),
        valor_esperado: String(lines.length),
      })
    }
  }

  // Block open/close integrity
  const activeBlocks = new Set<string>()
  for (const ln of lines) {
    const blk = detectBloco(ln.registro)
    if (blk !== '?') activeBlocks.add(blk)
  }

  for (const blk of activeBlocks) {
    const openReg  = `${blk}001`
    const closeReg = blk === '9' ? '9990' : `${blk}990`

    if (!byReg[openReg]) {
      const sample = lines.find(l => l.registro.startsWith(blk))
      errors.push({
        severity: 'ERROR', category: 'Estrutura', bloco: blk, registro: openReg,
        linha: sample?.numero ?? 0, campo: null, code: 'EST003',
        mensagem: `Bloco ${blk} não possui registro de abertura ${openReg}`,
        sugestao: `Inclua o registro ${openReg} (abertura do bloco ${blk}) antes dos demais registros do bloco`,
        technical: `Bloco ${blk} ativo mas ${openReg} ausente`,
        raw: '', valor_encontrado: null, valor_esperado: openReg,
      })
    }

    if (!byReg[closeReg]) {
      errors.push({
        severity: 'ERROR', category: 'Estrutura', bloco: blk, registro: closeReg,
        linha: 0, campo: null, code: 'EST004',
        mensagem: `Bloco ${blk} não possui registro de encerramento ${closeReg}`,
        sugestao: `Inclua o registro ${closeReg} (encerramento do bloco ${blk}) após todos os registros do bloco`,
        technical: `Bloco ${blk} ativo mas ${closeReg} ausente`,
        raw: '', valor_encontrado: null, valor_esperado: closeReg,
      })
    }
  }

  // ── Header field checks (0000) ─────────────────────────────────────────────

  if (!hdr) {
    errors.push({
      severity: 'CRITICAL', category: 'Cadastro', bloco: '0', registro: '0000',
      linha: 0, campo: 'CNPJ', code: 'CAD001',
      mensagem: 'Registro 0000 não encontrado — impossível identificar o arquivo',
      sugestao: 'Todo arquivo EFD deve começar com o registro 0000 preenchido corretamente',
      technical: 'byReg[0000] is undefined',
      raw: '', valor_encontrado: null, valor_esperado: 'Registro 0000 completo',
    })
  } else {
    // CNPJ
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      errors.push({
        severity: 'CRITICAL', category: 'Cadastro', bloco: '0', registro: '0000',
        linha: hdr.numero, campo: 'CNPJ', code: 'CAD001',
        mensagem: 'CNPJ ausente ou com formato inválido no registro 0000',
        sugestao: 'Informe o CNPJ com 14 dígitos no campo CNPJ do registro 0000',
        technical: `CNPJ encontrado: "${cnpj}"`,
        raw: hdr.raw, valor_encontrado: cnpj || null, valor_esperado: '14 dígitos numéricos',
      })
    } else if (!isValidCnpj(cnpj)) {
      errors.push({
        severity: 'ERROR', category: 'Cadastro', bloco: '0', registro: '0000',
        linha: hdr.numero, campo: 'CNPJ', code: 'CAD002',
        mensagem: 'CNPJ no registro 0000 não passa na validação de dígito verificador',
        sugestao: 'Verifique se o CNPJ está correto. Um CNPJ inválido pode indicar arquivo de empresa errada.',
        technical: `CNPJ "${cnpj}" falhou na validação mod-11`,
        raw: hdr.raw, valor_encontrado: cnpj, valor_esperado: 'CNPJ com dígitos verificadores válidos',
      })
    }

    // Period dates
    if (!dtIni || !isValidDate(dtIni)) {
      errors.push({
        severity: 'ERROR', category: 'Cadastro', bloco: '0', registro: '0000',
        linha: hdr.numero, campo: 'DT_INI', code: 'CAD003',
        mensagem: 'Data inicial (DT_INI) ausente ou com formato inválido no registro 0000',
        sugestao: 'Informe DT_INI no formato DDMMAAAA (ex: 01012024)',
        technical: `DT_INI encontrado: "${dtIni}"`,
        raw: hdr.raw, valor_encontrado: dtIni || null, valor_esperado: 'DDMMAAAA',
      })
    }
    if (!dtFim || !isValidDate(dtFim)) {
      errors.push({
        severity: 'ERROR', category: 'Cadastro', bloco: '0', registro: '0000',
        linha: hdr.numero, campo: 'DT_FIN', code: 'CAD004',
        mensagem: 'Data final (DT_FIN) ausente ou com formato inválido no registro 0000',
        sugestao: 'Informe DT_FIN no formato DDMMAAAA (ex: 31012024)',
        technical: `DT_FIN encontrado: "${dtFim}"`,
        raw: hdr.raw, valor_encontrado: dtFim || null, valor_esperado: 'DDMMAAAA',
      })
    }

    // COD_VER
    if (!codVer) {
      errors.push({
        severity: 'WARNING', category: 'Cadastro', bloco: '0', registro: '0000',
        linha: hdr.numero, campo: 'COD_VER', code: 'CAD005',
        mensagem: 'Versão do leiaute (COD_VER) não informada no registro 0000',
        sugestao: 'Preencha COD_VER conforme a versão do Guia Prático EFD utilizada',
        technical: `COD_VER encontrado: "${codVer}"`,
        raw: hdr.raw, valor_encontrado: null, valor_esperado: 'ex: 015, 016, 017',
      })
    }
  }

  // ── Campo count checks ─────────────────────────────────────────────────────
  const schemaInfo: ValidationResult['schema_info'] = []
  for (const [reg, expected] of Object.entries(REGISTRO_SCHEMA)) {
    const occurrences = byReg[reg]
    if (!occurrences) continue
    for (const ln of occurrences) {
      const found = ln.campos.length
      const ok = found === expected
      schemaInfo.push({ registro: reg, campos_esperados: expected, campos_encontrados: found, ok })
      if (!ok) {
        errors.push({
          severity: 'WARNING', category: 'Schema', bloco: detectBloco(reg), registro: reg,
          linha: ln.numero, campo: null, code: 'CAM001',
          mensagem: `Registro ${reg}: ${found} campo(s) encontrado(s), esperado(s) ${expected}`,
          sugestao: `Verifique o leiaute do registro ${reg} conforme a versão do arquivo (COD_VER=${codVer || '?'})`,
          technical: `campos_encontrados=${found} campos_esperados=${expected}`,
          raw: ln.raw, valor_encontrado: String(found), valor_esperado: String(expected),
        })
        break // report once per register type
      }
    }
  }

  // ── Build blocos summary ───────────────────────────────────────────────────
  const blocos: Record<string, BlocoResult> = {}
  for (const blk of activeBlocks) {
    const blkErrors = errors.filter(e => e.bloco === blk && (e.severity === 'CRITICAL' || e.severity === 'ERROR'))
    const blkWarns  = errors.filter(e => e.bloco === blk && e.severity === 'WARNING')
    const regsInBlk = lines.filter(l => detectBloco(l.registro) === blk)
    blocos[blk] = {
      bloco: blk,
      total_registros: regsInBlk.length,
      total_erros:     blkErrors.length,
      total_avisos:    blkWarns.length,
      status: blkErrors.length > 0 ? 'error' : blkWarns.length > 0 ? 'warning' : 'ok',
    }
  }

  // ── Quick checks ───────────────────────────────────────────────────────────
  const quick_checks: QuickCheck[] = [
    {
      label: 'CNPJ presente e válido',
      status: cnpj && isValidCnpj(cnpj) ? 'ok' : cnpj ? 'fail' : 'fail',
      detail: cnpj ? (isValidCnpj(cnpj) ? cnpj : `CNPJ inválido: ${cnpj}`) : 'CNPJ ausente',
    },
    {
      label: 'Período definido (DT_INI e DT_FIN)',
      status: isValidDate(dtIni) && isValidDate(dtFim) ? 'ok' : 'fail',
      detail: periodo || 'Período não identificado',
    },
    {
      label: 'Versão do leiaute informada (COD_VER)',
      status: codVer ? 'ok' : 'fail',
      detail: codVer || 'COD_VER ausente',
    },
    {
      label: 'Bloco 0 com abertura e encerramento',
      status: byReg['0001'] && byReg['0990'] ? 'ok' : 'fail',
      detail: !byReg['0001'] ? '0001 ausente' : !byReg['0990'] ? '0990 ausente' : 'OK',
    },
    {
      label: 'Bloco 9 com encerramento correto',
      status: byReg['9001'] && byReg['9999'] ? 'ok' : 'fail',
      detail: !byReg['9001'] ? '9001 ausente' : !byReg['9999'] ? '9999 ausente' : 'OK',
    },
    {
      label: 'Totalizador de linhas (9999) correto',
      status: (() => {
        if (!reg9999) return 'fail'
        const dec = parseInt(reg9999.campos[1] ?? '0', 10)
        return dec === lines.length ? 'ok' : 'fail'
      })(),
      detail: reg9999
        ? `Declarado: ${reg9999.campos[1]} | Real: ${lines.length}`
        : 'Registro 9999 não encontrado',
    },
  ]

  // ── Recommendations ────────────────────────────────────────────────────────
  const recommendations: Recommendation[] = []
  const hasStructuralErrors = errors.some(e => e.code.startsWith('EST') && (e.severity === 'CRITICAL' || e.severity === 'ERROR'))
  if (hasStructuralErrors) {
    recommendations.push({
      registro: '0000',
      titulo: 'Corrija a estrutura de blocos do arquivo',
      passos: [
        'Verifique se cada bloco presente tem os registros de abertura (X001) e encerramento (X990)',
        'Confira se o arquivo inicia com |0000| e termina com |9999|',
        'Certifique-se de que o totalizador 9999 reflete o total real de linhas',
      ],
      erros_relacionados: errors.filter(e => e.code.startsWith('EST')).map(e => e.code),
    })
  }

  const hasCnpjError = errors.some(e => e.code === 'CAD001' || e.code === 'CAD002')
  if (hasCnpjError) {
    recommendations.push({
      registro: '0000',
      titulo: 'Corrija o CNPJ no registro 0000',
      passos: [
        'Localize o registro 0000 (primeira linha do arquivo)',
        'O campo CNPJ é o 7º campo (posição 6 contando a partir de 0, após o código do registro)',
        'Informe 14 dígitos numéricos sem pontuação',
        'Valide o dígito verificador com uma calculadora de CNPJ',
      ],
      erros_relacionados: ['CAD001', 'CAD002'],
    })
  }

  const hasDateError = errors.some(e => e.code === 'CAD003' || e.code === 'CAD004')
  if (hasDateError) {
    recommendations.push({
      registro: '0000',
      titulo: 'Corrija as datas de período no registro 0000',
      passos: [
        'DT_INI (campo 4) e DT_FIN (campo 5) devem estar no formato DDMMAAAA',
        'Exemplo: período Jan/2024 → DT_INI=01012024, DT_FIN=31012024',
        'DT_INI deve ser o primeiro dia do mês e DT_FIN o último',
      ],
      erros_relacionados: ['CAD003', 'CAD004'],
    })
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalCriticos = errors.filter(e => e.severity === 'CRITICAL').length
  const totalErros    = errors.filter(e => e.severity === 'ERROR').length
  const totalAvisos   = errors.filter(e => e.severity === 'WARNING').length
  const totalIssues   = totalCriticos + totalErros + totalAvisos

  let status: ValidationStatus
  if (totalCriticos > 0) status = 'REPROVADO'
  else if (totalErros > 0)  status = 'COM_ERROS'
  else if (totalAvisos > 0) status = 'COM_AVISOS'
  else status = 'APROVADO'

  const summary: ValidationSummary = {
    total_linhas:   lines.length,
    total_criticos: totalCriticos,
    total_erros:    totalErros,
    total_avisos:   totalAvisos,
    total_issues:   totalIssues,
    status,
  }

  return {
    id,
    file_name: fileName,
    cnpj,
    periodo,
    cod_ver: codVer,
    blocos,
    errors,
    quick_checks,
    schema_info: schemaInfo,
    recommendations,
    summary,
    created_at: new Date().toISOString(),
  }
}
