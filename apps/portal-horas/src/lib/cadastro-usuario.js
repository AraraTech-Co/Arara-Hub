// =============================================================================
// Cadastro de usuário do Gestão de Horas em três passos — espelha o
// apps/portal-suporte/app/lib/api/membros.ts.
//
//   1. conta na plataforma  — POST /v1/auth/register (201 = nova, 409 = já existe)
//   2. perfil no Horas       — POST /v1/r/portal-horas/users (StaffProfile)
//   3. acesso ao app         — POST /v1/apps/portal-horas/members (JWT do admin)
//
// Os três são idempotentes: se algo falhar no meio, clicar de novo completa.
// Usa só `fetch` + `localStorage` de propósito — assim a lib é testável com o
// fetch interceptado, sem depender do bundler nem mudar o login (arara.ts).
// =============================================================================

const ARARA_URL = (import.meta.env?.VITE_ARARA_API_URL ?? '').replace(/\/$/, '');
const SLUG = import.meta.env?.VITE_ARARA_APP_SLUG || 'portal-horas';

const MSG_403 =
  'Sua conta não administra o Gestão de Horas na plataforma (é preciso ser dono ou admin do app). ' +
  'Com essa permissão, clique de novo — repetir é seguro.';

function ls(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function getToken() {
  return ls('token') || ls('arara_jwt');
}

/** Renova o JWT uma vez com o refresh token, se houver. Devolve true se renovou.
 *  O login do Horas hoje não persiste refresh token — então em produção isto
 *  tende a devolver false e a chamada cai no "entre de novo". */
async function renovarSessao() {
  const rt = ls('arara_refresh') || ls('refreshToken');
  if (!rt) return false;
  try {
    const r = await fetch(`${ARARA_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!r.ok) return false;
    const b = await r.json().catch(() => ({}));
    const tok = b.token || b.accessToken;
    if (!tok) return false;
    try {
      localStorage.setItem('token', tok);
      localStorage.setItem('arara_jwt', tok);
      if (b.refreshToken) localStorage.setItem('arara_refresh', b.refreshToken);
    } catch {
      /* storage pode estar bloqueado */
    }
    return true;
  } catch {
    return false;
  }
}

/** Já é membro do app? true/false, ou null quando não deu para saber.
 *  403 lança MSG_403 (mesma mensagem do POST — decisão do orquestrador). */
async function jaEhMembro(userId) {
  const enviar = (jwt) =>
    fetch(`${ARARA_URL}/v1/apps/${SLUG}/members`, {
      headers: { Authorization: `Bearer ${jwt}` },
    }).catch(() => null);

  let jwt = getToken();
  let r = jwt ? await enviar(jwt) : null;
  if (r && r.status === 401 && (await renovarSessao())) {
    jwt = getToken();
    r = jwt ? await enviar(jwt) : r;
  }
  if (!r) return null;
  if (r.status === 403) {
    const e = new Error(MSG_403);
    e.code = 'members_403';
    throw e;
  }
  if (!r.ok) return null;
  const b = await r.json().catch(() => ({}));
  const lista = Array.isArray(b.members) ? b.members : Array.isArray(b) ? b : [];
  return lista.some((m) => String(m.userId || m.user_id || m.id) === String(userId));
}

/** Passo 3: POST /members, renovando a sessão uma vez em caso de 401. */
async function liberarAcesso(userId, role) {
  const enviar = (jwt) =>
    fetch(`${ARARA_URL}/v1/apps/${SLUG}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    }).catch(() => null);

  const jwt = getToken();
  let r = jwt ? await enviar(jwt) : null;
  if (!jwt || (r && r.status === 401)) {
    if (await renovarSessao()) {
      const novo = getToken();
      if (novo) r = await enviar(novo);
    }
  }
  return r;
}

/**
 * Cadastra alguém do começo ao fim. `dados` traz os campos do formulário
 * (camelCase do app) + `senha`, `trocarSenha`, `role` (papel do Horas).
 * `onStep(msg)` é opcional, para feedback de progresso.
 */
export async function cadastrarUsuario(dados, onStep) {
  const email = String(dados.email || '').trim().toLowerCase();
  const nome = String(dados.nome || '').trim();
  const senha = String(dados.senha || '');
  const trocarSenha = !!dados.trocarSenha;
  const role = dados.role === 'admin' ? 'admin' : dados.role || 'user';

  // ── passo 1: conta na plataforma (só quando o admin digitou uma senha) ──────
  // Senha vazia = a tela não sabe se a conta existe; pula o registro e deixa o
  // passo 2 responder sem_conta se precisar.
  let contaCriada = false;
  if (senha) {
    onStep?.('Criando a conta…');
    const reg = await fetch(`${ARARA_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha, name: nome }),
    }).catch(() => null);
    if (!reg) throw new Error('Sem conexão com a plataforma ao criar a conta. Tente de novo.');
    // A resposta traz o token da PESSOA NOVA — não é guardado (trocaria a sessão do admin).
    contaCriada = reg.ok;
    if (!reg.ok && reg.status !== 409) {
      const b = await reg.json().catch(() => ({}));
      throw new Error(`Não foi possível criar a conta: ${b.error || `HTTP ${reg.status}`}.`);
    }
  }

  // ── passo 2: perfil no Horas ────────────────────────────────────────────────
  onStep?.('Gravando o perfil…');
  // A senha só vai ao servidor para REGRAVAR numa conta existente que o admin
  // mandou trocar. Conta nova já teve a senha definida no registro.
  const trocarNoServidor = !contaCriada && trocarSenha && !!senha;
  const perfilBody = {
    email,
    fullName: nome,
    role,
    managerRole: dados.managerRole,
    active: dados.active,
    squadId: dados.squadId || undefined,
    rateType: dados.rateType || undefined,
    hourlyRate: dados.hourlyRate,
    monthlyRate: dados.monthlyRate,
    canLogProject: dados.canLogProject,
    canLogSupport: dados.canLogSupport,
    canLogBip: dados.canLogBip,
    canLogBackup: dados.canLogBackup,
    emailNotifications: dados.emailNotifications,
    trocar_senha: trocarNoServidor,
    password: trocarNoServidor ? senha : undefined,
  };
  const jwtPerfil = getToken();
  const resp = await fetch(`${ARARA_URL}/v1/r/${SLUG}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwtPerfil ? { Authorization: `Bearer ${jwtPerfil}` } : {}),
    },
    body: JSON.stringify(perfilBody),
  }).catch(() => null);
  if (!resp)
    throw new Error('Sem conexão com o servidor ao gravar o perfil. Clique de novo — repetir é seguro.');
  const corpo = await resp.json().catch(() => ({}));

  let userId = '';
  let perfilExistia = false;
  if (resp.ok) {
    userId = String(corpo.user_id || corpo.data?.id || '');
  } else if (resp.status === 409 && corpo.codigo === 'perfil_existe') {
    // Sucesso parcial: o perfil já existia; usa o user_id e segue para o acesso.
    userId = String(corpo.user_id || '');
    perfilExistia = true;
  } else if (resp.status === 409 && corpo.codigo === 'sem_conta') {
    const e = new Error(
      'Essa pessoa ainda não tem login na Arara. Preencha a senha inicial (mín. 8) e clique de novo — nada foi gravado.',
    );
    e.code = 'sem_conta';
    throw e;
  } else if (resp.status === 403) {
    throw new Error('Só administradores do Gestão de Horas podem cadastrar usuários.');
  } else {
    throw new Error(
      `Conta ok, mas o perfil não foi gravado: ${corpo.error || `HTTP ${resp.status}`}. Clique de novo — repetir é seguro.`,
    );
  }
  if (!userId)
    throw new Error('O servidor não devolveu o id da conta. Clique de novo — repetir é seguro.');

  // ── passo 3: acesso ao app (só se ainda não for membro) ─────────────────────
  onStep?.('Liberando o acesso…');
  const roleApp = role === 'admin' ? 'admin' : 'user';
  const jaMembro = await jaEhMembro(userId); // pode lançar MSG_403
  let acessoLiberado = false;
  if (jaMembro !== true) {
    // null (não deu para consultar) ou false → tenta liberar; o POST é upsert,
    // mas só chega aqui quem não consta como membro.
    const r = await liberarAcesso(userId, roleApp);
    if (!r)
      throw new Error(
        'Perfil gravado, mas sua sessão da plataforma não está disponível para liberar o acesso. Saia, entre de novo e clique outra vez — repetir é seguro.',
      );
    if (r.status === 401)
      throw new Error(
        'Perfil gravado, mas sua sessão expirou antes de liberar o acesso. Saia, entre de novo e clique outra vez — repetir é seguro.',
      );
    if (r.status === 403) throw new Error(MSG_403);
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(
        `Perfil gravado, mas o acesso não foi liberado: ${b.error || `HTTP ${r.status}`}. Clique de novo — repetir é seguro.`,
      );
    }
    acessoLiberado = true;
  }

  return {
    userId,
    email,
    role,
    contaCriada,
    perfilExistia,
    jaEraMembro: jaMembro === true,
    acessoLiberado,
    // Senha de conta EXISTENTE aplicada por esta tela.
    senhaDefinida: trocarNoServidor,
    // Aviso obrigatório: senha digitada numa conta existente, mas caixa desmarcada.
    senhaIgnorada: !contaCriada && !!senha && !trocarSenha,
  };
}

/** Monta a mensagem de sucesso dizendo o que aconteceu em cada passo. */
export function mensagemSucesso(r) {
  const partes = [
    r.contaCriada ? 'Conta de login criada na Arara.' : 'A pessoa já tinha login na Arara.',
    r.perfilExistia
      ? 'Já havia perfil no Gestão de Horas (mantido como estava).'
      : 'Perfil criado no Gestão de Horas.',
    r.jaEraMembro
      ? 'Acesso ao módulo já estava liberado.'
      : r.acessoLiberado
        ? 'Acesso ao módulo liberado.'
        : 'Acesso ao módulo não foi alterado.',
  ];
  if (r.senhaIgnorada) {
    partes.push(
      "A senha digitada NÃO foi aplicada: a pessoa já tinha login na Arara. Para trocar, marque 'Trocar a senha de login'.",
    );
  } else if (r.senhaDefinida) {
    partes.push('Senha de login atualizada (vale para todos os sistemas da Arara).');
  }
  return partes.join(' ');
}
