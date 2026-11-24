/**
 * Formulário de contato do site (arara-tech.com) → lead no pool do CRM.
 *
 * A Netlify Forms chama esta rota pelo webhook de saída a cada envio aceito
 * do formulário `contato`. O token vem na URL (`?token=`) e é conferido pela
 * plataforma contra o segredo `site_contato` antes do handler rodar.
 * Desenho: docs/crm/2026-11-24-desenho-formulario-do-site-no-crm.md (fora do repo).
 */
import type { HandlerCtx, StaticRoute } from '../../lib/handler-ctx.js'

type Registro = Record<string, unknown>

const FORMULARIO = 'contato'

function texto(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** CNPJ numérico ou alfanumérico (Receita, 2026): 12 caracteres + 2 dígitos verificadores. */
export function normalizarCnpj(v: unknown): string | null {
  const c = texto(v, 40).toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return null
  const valor = (ch: string) => ch.charCodeAt(0) - 48
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = [...base].reduce((s, ch, i) => s + valor(ch) * pesos[i], 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(c.slice(0, 12))
  const d2 = dv(c.slice(0, 12) + d1)
  return c[12] === String(d1) && c[13] === String(d2) ? c : null
}

function consentiu(v: unknown): boolean {
  const t = texto(v, 20).toLowerCase()
  return t !== '' && t !== 'false' && t !== 'nao' && t !== 'não' && t !== '0'
}

async function receberContato(ctx: HandlerCtx) {
  const { Client } = ctx.models
  if (!Client) return ctx.reply.status(500).send({ error: 'Model Client missing' })

  const envio = (ctx.body ?? {}) as Registro
  const d = (envio.data && typeof envio.data === 'object' ? envio.data : {}) as Registro
  const formulario = texto(envio.form_name, 80) || texto(d['form-name'], 80)
  if (formulario !== FORMULARIO) return ctx.reply.send({ ok: true, ignorado: 'formulario' })
  if (texto(d['bot-field'])) return ctx.reply.send({ ok: true, ignorado: 'honeypot' })

  const idEnvio = texto(envio.id, 80).replace(/[^0-9A-Za-z_-]/g, '')
  if (!idEnvio) return ctx.reply.status(400).send({ error: 'Envio sem id' })
  const id = `site-${idEnvio}`
  if (await Client.findById(id)) return ctx.reply.send({ ok: true, id, repetido: true })

  const nome = texto(d.nome, 200)
  const empresa = texto(d.empresa, 200)
  if (!nome && !empresa) return ctx.reply.status(400).send({ error: 'Envio sem nome e sem empresa' })

  const cnpjInformado = texto(d.cnpj, 40)
  const cnpj = normalizarCnpj(cnpjInformado)
  const cidade = texto(d.cidade, 120)
  const segmento = texto(d.segmento, 80)
  const caixas = texto(d.caixas, 40)
  const sistemaAtual = texto(d.sistema_atual, 200)
  const mensagem = texto(d.mensagem, 4000)
  const pagina = texto(d.pagina, 300)

  let duplicado: Registro | null = null
  if (cnpj) {
    const achados = (await Client.findMany({ cnpj, limit: 1 })) as Registro[]
    duplicado = achados[0] ?? null
  }

  const notas = [
    'Contato pelo site (arara-tech.com).',
    nome ? `Contato: ${nome}` : '',
    cidade ? `Cidade: ${cidade}` : '',
    segmento ? `Segmento: ${segmento}` : '',
    caixas ? `Caixas: ${caixas}` : '',
    sistemaAtual ? `Sistema atual: ${sistemaAtual}` : '',
    cnpjInformado && !cnpj ? `CNPJ informado (não confere): ${cnpjInformado}` : '',
    duplicado ? `Atenção: já existe o cadastro "${String(duplicado.name ?? '')}" com este CNPJ.` : '',
    mensagem ? `Mensagem: ${mensagem}` : '',
    pagina ? `Página: ${pagina}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const agora = new Date().toISOString()
  const enviadoEm = texto(envio.created_at, 40) || agora
  const lead: Registro = {
    id,
    type: 'lead',
    source: 'site',
    isMatriz: true,
    ownerId: null,
    name: empresa || nome,
    company: empresa || null,
    contatoNome: nome || null,
    email: texto(d.email, 200) || null,
    phone: texto(d.whatsapp, 40) || null,
    cidade: cidade || null,
    segmento: segmento || null,
    caixas: caixas || null,
    sistemaAtual: sistemaAtual || null,
    tags: segmento ? ['site', segmento] : ['site'],
    notes: notas,
    consentimento: consentiu(d.consentimento),
    textoConsentimento: texto(d.texto_consentimento, 2000) || null,
    consentimentoEm: enviadoEm,
    envioSiteId: idEnvio,
    createdAt: agora,
    updatedAt: agora,
  }
  if (cnpj) lead.cnpj = cnpj
  if (duplicado) lead.duplicadoDe = duplicado.id

  await Client.create(lead)
  return ctx.reply.status(201).send({ ok: true, id })
}

export const rotasDoSiteContato: StaticRoute[] = [
  {
    module: 'crm-site',
    method: 'POST',
    path: '/webhook/site-contato',
    authMode: 'webhook_secret',
    webhookSecretName: 'site_contato',
    requiredPermissions: [],
    handler: receberContato,
  },
]
