/**
 * Migração: criptografa senhas SSH plain text já existentes no banco.
 *
 * Uso:
 *   npx tsx scripts/encrypt-ssh-passwords.ts
 *
 * Pré-requisitos:
 *   - SSH_ENCRYPTION_KEY definida no .env (64 chars hex)
 *   - DATABASE_URL definida no .env
 *
 * Seguro para rodar múltiplas vezes — ignora registros já criptografados (prefixo "enc:").
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { encrypt, isEncrypted } from '../app/lib/crypto/ssh-crypto'

const pool   = new Pool({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const servers = await prisma.sshServer.findMany({
    select: { id: true, nome: true, senha: true },
  })

  let updated = 0
  let skipped = 0

  for (const server of servers) {
    if (!server.senha) { skipped++; continue }
    if (isEncrypted(server.senha)) { skipped++; continue }

    await prisma.sshServer.update({
      where: { id: server.id },
      data:  { senha: encrypt(server.senha) },
    })

    console.log(`✓ ${server.nome} (${server.id})`)
    updated++
  }

  console.log(`\nConcluído: ${updated} atualizados, ${skipped} ignorados.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
