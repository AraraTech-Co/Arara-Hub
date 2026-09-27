/**
 * Fix hourly_rate / monthly_rate types on time-management StaffProfile ModelDef.
 * node scripts/time-management/upsert-staff-profile-rates-schema.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'time-management'
const CANDIDATES = [
  `${APP_SLUG}-StaffProfile`,
  'StaffProfile',
  `${APP_SLUG}-Users`,
  'Users',
]

const RATE_FIELDS = ['hourly_rate', 'monthly_rate']

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  let def = null
  for (const name of CANDIDATES) {
    def = await prisma.modelDef.findFirst({ where: { appId: app.id, name } })
    if (def) break
  }
  if (!def) throw new Error('StaffProfile ModelDef not found')

  const schema =
    def.schema && typeof def.schema === 'object' && !Array.isArray(def.schema)
      ? structuredClone(def.schema)
      : { type: 'object', properties: {} }

  if (!schema.properties || typeof schema.properties !== 'object') {
    schema.properties = {}
  }
  schema.type = schema.type || 'object'

  for (const field of RATE_FIELDS) {
    schema.properties[field] = { type: 'number' }
  }

  await prisma.modelDef.update({
    where: { id: def.id },
    data: { schema },
  })

  console.log(`✓ Updated schema on ModelDef ${def.name} (${RATE_FIELDS.join(', ')} → number)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
