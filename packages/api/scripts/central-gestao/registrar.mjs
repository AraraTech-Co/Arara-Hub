/**
 * Registra a Central de Gestão na plataforma: app, models, membership e Profile de cada pessoa.
 *
 * Por padrão SÓ LÊ e mostra o que faria. Grava apenas com --aplicar.
 * Pode rodar de novo: nada é duplicado (app e models por chave única, Profile procurado pelo id).
 * Não cria conta: quem não existir em `users` é listado e pulado.
 *
 *   node registrar.mjs --pessoas /caminho/pessoas.json            # simula
 *   node registrar.mjs --pessoas /caminho/pessoas.json --aplicar  # grava
 * Roda com o Node e o @prisma/client da imagem da API (dentro do contêiner arara-platform-prd),
 * com `models.json` na mesma pasta do script.
 *
 * pessoas.json (fora do repositório — o repo é público):
 *   [{ "email": "...", "name": "Nome", "role": "admin" | "membro", "dono": true? }]
 * Exatamente uma pessoa com "dono": true (dona do app na plataforma; precisa ser "admin").
 * Usa o DATABASE_URL do ambiente (o contêiner da API já tem).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SLUG = 'central-gestao'
export const NOME_APP = 'Central de Gestão'
const AQUI = path.dirname(fileURLToPath(import.meta.url))


export function validarPessoas(bruto) {
  if (!Array.isArray(bruto) || bruto.length === 0) throw new Error('pessoas.json deve ser uma lista não vazia')
  const vistos = new Set()
  const lista = bruto.map((p, i) => {
    const o = p
    const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : ''
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`item ${i}: e-mail inválido`)
    if (!name || name.length > 120) throw new Error(`item ${i}: name obrigatório (até 120)`)
    if (o.role !== 'admin' && o.role !== 'membro') throw new Error(`item ${i}: role deve ser "admin" ou "membro"`)
    if (vistos.has(email)) throw new Error(`item ${i}: e-mail repetido`)
    vistos.add(email)
    return { email, name, role: o.role, dono: o.dono === true }
  })
  const donos = lista.filter((p) => p.dono)
  if (donos.length !== 1) throw new Error('marque exatamente uma pessoa com "dono": true')
  if (donos[0].role !== 'admin') throw new Error('o dono precisa ter role "admin"')
  return lista
}

export function lerModels() {
  return JSON.parse(fs.readFileSync(path.join(AQUI, 'models.json'), 'utf8'))
}

/** Executa (ou simula) o registro. Devolve as linhas do relatório. */
export async function registrar(db, pessoas, aplicar) {
  const log = []
  const faz = aplicar ? 'feito' : 'faria'

  // 1. Pessoas: só contas que já existem.
  const contas = new Map()
  for (const p of pessoas) {
    const u = await db.user.findFirst({ where: { email: { equals: p.email, mode: 'insensitive' } }, select: { id: true, email: true, name: true } })
    if (u) contas.set(p.email, { id: u.id, email: u.email })
    else log.push(`SEM CONTA: ${p.email} — pulado (a pessoa precisa entrar pelo Hub uma vez, ou ter conta criada)`)
  }
  const dono = pessoas.find((p) => p.dono)
  const contaDono = contas.get(dono.email)
  if (!contaDono) {
    log.push(`PARADO: o dono (${dono.email}) não tem conta; nada foi ${aplicar ? 'gravado' : 'simulado'} além da leitura.`)
    return log
  }

  // 2. App.
  let app = await db.app.findUnique({ where: { slug: SLUG } })
  if (app) log.push(`app ${SLUG}: já existe (status ${app.status})`)
  else {
    log.push(`app ${SLUG}: ${faz} criar (dono ${contaDono.email})`)
    if (aplicar) app = await db.app.create({ data: { slug: SLUG, name: NOME_APP, ownerId: contaDono.id } })
  }

  // 3. Models (nome guardado com o prefixo do app, como a API publica).
  for (const m of lerModels()) {
    const nome = `${SLUG}-${m.name}`
    const existe = app ? await db.modelDef.findUnique({ where: { appId_name: { appId: app.id, name: nome } } }) : null
    log.push(`model ${nome}: ${existe ? `${faz} atualizar o schema` : `${faz} criar`}`)
    if (aplicar && app) {
      if (existe) await db.modelDef.update({ where: { id: existe.id }, data: { schema: m.schema } })
      else await db.modelDef.create({ data: { appId: app.id, name: nome, schema: m.schema, version: 1 } })
    }
  }

  // 4. Membership e Profile.
  for (const p of pessoas) {
    const c = contas.get(p.email)
    if (!c) continue
    const papelPlataforma = p.role === 'admin' ? 'admin' : 'user'
    const atual = app ? await db.appMembership.findUnique({ where: { userId_appId: { userId: c.id, appId: app.id } } }) : null
    log.push(`membership ${p.email}: ${atual ? (atual.role === papelPlataforma ? 'já existe' : `${faz} trocar ${atual.role} → ${papelPlataforma}`) : `${faz} criar (${papelPlataforma})`}`)
    if (aplicar && app && (!atual || atual.role !== papelPlataforma)) {
      await db.appMembership.upsert({
        where: { userId_appId: { userId: c.id, appId: app.id } },
        create: { userId: c.id, appId: app.id, role: papelPlataforma },
        update: { role: papelPlataforma },
      })
    }

    const dados = { id: c.id, name: p.name, role: p.role, active: true }
    const perfil = app
      ? await db.modelRecord.findFirst({ where: { appId: app.id, modelName: `${SLUG}-Profile`, data: { path: ['id'], equals: c.id } } })
      : null
    log.push(`Profile ${p.email}: ${perfil ? `${faz} atualizar (${p.role}, ativo)` : `${faz} criar (${p.role}, ativo)`}`)
    if (aplicar && app) {
      if (perfil) await db.modelRecord.update({ where: { id: perfil.id }, data: { data: { ...perfil.data, ...dados } } })
      else await db.modelRecord.create({ data: { appId: app.id, modelName: `${SLUG}-Profile`, data: dados } })
    }
  }
  if (!aplicar) log.push('SIMULAÇÃO: nada foi gravado. Rode de novo com --aplicar para gravar.')
  return log
}

async function main() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--pessoas')
  if (i < 0 || !args[i + 1]) throw new Error('use --pessoas /caminho/pessoas.json')
  const pessoas = validarPessoas(JSON.parse(fs.readFileSync(args[i + 1], 'utf8')))
  const aplicar = args.includes('--aplicar')
  try {
    await import('dotenv/config')
  } catch {
    /* no contêiner o ambiente já vem pronto */
  }
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()
  try {
    const linhas = await registrar(prisma, pessoas, aplicar)
    for (const l of linhas) console.log(l)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('ERRO:', e && e.message ? e.message : e)
    process.exit(1)
  })
}
