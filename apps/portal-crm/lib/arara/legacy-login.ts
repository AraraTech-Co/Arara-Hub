import { arara, ARARA_SLUG } from './client'

/** Browser: login + mint portal-crm API key into localStorage. */
export async function araraLogin(email: string, password: string) {
  const data = await arara.login(email, password)
  try {
    const created = await arara.createAppKey(ARARA_SLUG, 'crm-ui')
    arara.bindAppKey(ARARA_SLUG, created.apiKey.key)
  } catch {
    // optional
  }
  return data
}
