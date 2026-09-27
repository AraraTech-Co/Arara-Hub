'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { arara, ARARA_SLUG, AraraError, renovarSessaoPlataforma } from './client'
import { criarSessao, encerrarSessao, getSessaoToken, limparSessaoLocal, validarSessao } from './sessao'
import {
  clearAuth,
  getAppApiKey,
  getAppRole,
  getJwt,
  getStoredUser,
  isAdmin,
  isStaff,
  setAppApiKey,
  setAppRole,
  setJwt,
  setMemberships,
  type AppRole,
  type AraraUser,
} from './auth-storage'

type AuthState = {
  ready: boolean
  user: AraraUser | null
  jwt: string | null
  appSlug: string
  appApiKey: string | null
  /** Nível dentro do portal (`Profile.role`) — o que a Equipe administra. */
  appRole: AppRole | null
  isStaff: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  ensureAppKey: () => Promise<string | null>
  setManualAppKey: (key: string) => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<AraraUser | null>(null)
  const [jwt, setJwtState] = useState<string | null>(null)
  const [appApiKey, setAppKeyState] = useState<string | null>(null)
  const [appRole, setAppRoleState] = useState<AppRole | null>(null)

  /** Lê o nível do portal e guarda; sem isso todo mundo é tratado como cliente. */
  const carregarNivel = useCallback(async (u: AraraUser | null | undefined) => {
    if (!u) return
    const role = await arara.appRole(u).catch(() => null)
    if (!role) return
    setAppRole(role)
    setAppRoleState(getAppRole())
  }, [])

  const refreshMe = useCallback(async () => {
    const token = getJwt()
    if (!token) {
      // Sem JWT ainda pode haver sessão do portal (o JWT expirou e foi
      // descartado numa abertura anterior). O usuário fica o do cache local.
      if (getSessaoToken()) {
        const viva = await validarSessao()
        if (viva) {
          if (viva.perfil?.role) setAppRole(viva.perfil.role)
          setAppRoleState(getAppRole())
          return
        }
        limparSessaoLocal()
      }
      setUser(null)
      setJwtState(null)
      return
    }
    try {
      const me = await arara.me()
      if (me.user) setUser(me.user)
      if (me.memberships) setMemberships(me.memberships)
      setJwtState(token)
      await carregarNivel(me.user)
      // A sessão do portal nascia no `login()` e SÓ lá. Quem logou antes do
      // mecanismo existir, quem passou dos 30 dias, ou quem teve a criação
      // falhando calada (ela é try/catch que devolve `false`, de propósito,
      // para não barrar a entrada) ficava sem token para sempre — e não havia
      // como recuperar sem sair e entrar de novo.
      //
      // Enquanto o servidor tratava chamada sem pessoa como serviço, isso não
      // aparecia. Depois da guarda de sessão virou 401 "Requer sessão do
      // portal" em toda rota — anexar arquivo, inclusive. Aqui ela se refaz
      // sozinha, aproveitando que o JWT recém-validado prova quem é.
      if (!getSessaoToken()) await criarSessao()
    } catch (e) {
      // Só CREDENCIAL RECUSADA desloga. Antes, qualquer falha aqui apagava a
      // sessão: API fora do ar, 500, Wi-Fi caindo no elevador — tudo derrubava
      // o login e mandava a pessoa digitar a senha de novo, sem que o token
      // tivesse nada de errado. Em falha transitória seguimos com o usuário
      // que já está em cache e tentamos de novo na próxima navegação.
      const recusado = e instanceof AraraError && (e.status === 401 || e.status === 403)
      if (recusado) {
        // 1ª tentativa: renovar o access com o refresh token da plataforma
        // (entregue em 21/08). É o caminho completo — devolve JWT de verdade,
        // então `ctx.user` volta a ter pessoa e TUDO funciona, inclusive as
        // rotas da plataforma que a sessão do portal não alcança.
        if (await renovarSessaoPlataforma()) {
          try {
            const me2 = await arara.me()
            if (me2.user) setUser(me2.user)
            if (me2.memberships) setMemberships(me2.memberships)
            setJwtState(getJwt())
            await carregarNivel(me2.user)
            return
          } catch {
            // renovou mas o /me falhou: segue para a sessão do portal
          }
        }
        // 2ª tentativa: a sessão do portal sustenta a identidade (30 dias).
        // Ver docs/plans/plano-sessao-persistente-portal.md.
        const viva = await validarSessao()
        if (viva) {
          // O JWT morto sai do armazenamento — deixá-lo lá faria toda chamada
          // tentar uma credencial recusada antes de cair na que funciona.
          setJwt(null)
          setJwtState(null)
          if (viva.perfil?.role) setAppRole(viva.perfil.role)
          setAppRoleState(getAppRole())
          return
        }
        clearAuth()
        limparSessaoLocal()
        setUser(null)
        setJwtState(null)
      } else {
        setJwtState(token)
      }
    }
  }, [carregarNivel])

  useEffect(() => {
    setJwtState(getJwt())
    setUser(getStoredUser())
    setAppKeyState(getAppApiKey(ARARA_SLUG))
    setAppRoleState(getAppRole())
    refreshMe().finally(() => setReady(true))
  }, [refreshMe])

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await arara.login(email, password)
      setUser(data.user)
      setJwtState(data.token)
      if (data.memberships) setMemberships(data.memberships)
      // O nível precisa vir antes de qualquer decisão de acesso — inclusive a
      // de mintar a chave, já que só staff tem direito a ela.
      await carregarNivel(data.user)
      // A sessão nasce AQUI, com o JWT recém-emitido provando quem é.
      await criarSessao()
      if (isStaff(data.user, ARARA_SLUG)) {
        try {
          const created = await arara.createAppKey(ARARA_SLUG, `ui-${data.user.email}`)
          arara.bindAppKey(ARARA_SLUG, created.apiKey.key)
          setAppKeyState(created.apiKey.key)
        } catch {
          // JWT com membership ainda acessa /v1/r após fix canAccessApp
        }
      }
    },
    [carregarNivel],
  )

  const logout = useCallback(() => {
    // Não esperamos a resposta: sair tem que ser imediato na tela. O token já
    // sai do navegador dentro de `encerrarSessao`.
    void encerrarSessao()
    clearAuth()
    setUser(null)
    setJwtState(null)
    setAppRoleState(null)
  }, [])

  const ensureAppKey = useCallback(async () => {
    const existing = getAppApiKey(ARARA_SLUG)
    if (existing) return existing
    if (!getJwt()) return null
    const created = await arara.createAppKey(ARARA_SLUG, 'ui-auto')
    arara.bindAppKey(ARARA_SLUG, created.apiKey.key)
    setAppKeyState(created.apiKey.key)
    return created.apiKey.key
  }, [])

  const setManualAppKey = useCallback((key: string) => {
    setAppApiKey(ARARA_SLUG, key)
    setAppKeyState(key)
  }, [])

  // Várias telas leem `user.roles` para decidir o que mostrar (o botão de
  // liberar o editor de fluxo, por exemplo, procura 'master' aí). Como o nível
  // que a equipe administra é o do portal, ele entra na frente da lista.
  const userComNivel = useMemo<AraraUser | null>(() => {
    if (!user) return null
    if (!appRole) return user
    return { ...user, roles: [appRole, ...user.roles.filter((r) => r !== appRole)] }
  }, [user, appRole])

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user: userComNivel,
      jwt,
      appSlug: ARARA_SLUG,
      appApiKey,
      appRole,
      isStaff: isStaff(user),
      isAdmin: isAdmin(user),
      login,
      logout,
      ensureAppKey,
      setManualAppKey,
      refreshMe,
    }),
    [
      ready,
      user,
      userComNivel,
      appRole,
      jwt,
      appApiKey,
      login,
      logout,
      ensureAppKey,
      setManualAppKey,
      refreshMe,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
