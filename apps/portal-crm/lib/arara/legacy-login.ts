import { arara } from './client'

/** Browser: login. As chamadas do app vão com o JWT da pessoa; não se cria chave de app. */
export async function araraLogin(email: string, password: string) {
  return arara.login(email, password)
}
