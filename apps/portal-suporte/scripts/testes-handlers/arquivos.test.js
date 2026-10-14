// Fase 5 — repositório de arquivos de apoio.
//
// O que importa aqui:
//  - a listagem devolve SÓ metadados (conteúdo nunca sai nela);
//  - ACL conferida no servidor em listar, baixar e apagar;
//  - limite de 10 MB e tipo, MEDIDOS do conteúdo e não do que a tela declara;
//  - exclusão LÓGICA, com evento, e o conteúdo apagado;
//  - auditoria em enviar/apagar, e NÃO em listar/baixar.
//
// Roda com: node arquivos.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const listar = carregarHandler('490a1 arquivos GET /arquivos')
const enviar = carregarHandler('490a2 arquivos POST /arquivos')
const baixar = carregarHandler('490a3 arquivos GET /arquivos/:id')
const apagar = carregarHandler('490a4 arquivos DELETE /arquivos/:id')

const ANA = { id: 'u-ana', role: 'support', feature_grants: [] }
const BIA = { id: 'u-bia', role: 'support', feature_grants: ['qa'] }
const DEV = { id: 'u-dev', role: 'developer', feature_grants: [] }
const CHEFE = { id: 'u-chefe', role: 'admin', feature_grants: [] }

const PNG = 'data:image/png;base64,' + 'A'.repeat(100)
const GRANDE = 'data:application/pdf;base64,' + 'A'.repeat(15 * 1024 * 1024)
const PROIBIDO = 'data:application/x-msdownload;base64,AAAA'

function cenario({ arquivos = [], perfis = [ANA, BIA, DEV, CHEFE], semModels = false } = {}) {
  const estado = {
    arquivos: arquivos.map((a) => ({ ...a })),
    conteudos: arquivos.map((a) => ({ id: a.id, arquivo_id: a.id, conteudo: PNG })),
    eventos: [],
    varreu: false,
  }
  // A ARMADILHA: `findMany({})` é varredura, e varredura aqui significa que a
  // janela de 500 da plataforma é preenchida também pelos arquivos APAGADOS.
  // Marcar e devolver vazio imita o teto estourado, que é como isso apareceria
  // em produção — silenciosamente.
  const filtra = (lista) => async (f) => {
    const ch = Object.keys(f || {})
    if (!ch.length) { estado.varreu = true; return [] }
    return lista().filter((x) => ch.every((k) => String(x[k] ?? '') === String(f[k])))
  }
  const models = {
    Profile: { findById: async (id) => perfis.find((p) => p.id === id) || null },
    Sessao: { findById: async () => null },
  }
  if (!semModels) {
    models.Arquivo = {
      findById: async (id) => estado.arquivos.find((a) => a.id === id) || null,
      findMany: filtra(() => estado.arquivos),
      create: async (a) => { estado.arquivos.push(a); return a },
      update: async (id, p) => { const a = estado.arquivos.find((x) => x.id === id); if (a) Object.assign(a, p); return a },
      delete: async (id) => { estado.arquivos = estado.arquivos.filter((x) => x.id !== id) },
    }
    models.ArquivoConteudo = {
      findById: async (id) => estado.conteudos.find((c) => c.id === id) || null,
      findMany: filtra(() => estado.conteudos),
      create: async (c) => { estado.conteudos.push(c); return c },
      delete: async (id) => { estado.conteudos = estado.conteudos.filter((c) => c.id !== id) },
    }
    models.ArquivoEvento = { create: async (e) => { estado.eventos.push(e); return e }, findMany: async () => estado.eventos }
  }
  return {
    estado,
    ctx: (perfil, extra = {}) => Object.assign({
      params: {}, query: {}, body: {}, headers: {},
      user: perfil ? { id: perfil.id } : null,
      models,
      reply: reply(),
    }, extra),
  }
}

;(async () => {
  // ══ guardas ════════════════════════════════════════════════════════════
  let c = cenario()
  let r = await listar(c.ctx(null))
  ok('listar sem sessão: 401', r.status === 401, r.status)
  r = await enviar(c.ctx(null, { body: { nome: 'x.png', conteudo: PNG } }))
  ok('enviar sem sessão: 401', r.status === 401, r.status)

  // ══ enviar ═════════════════════════════════════════════════════════════
  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'script.png', pasta: '/scripts/sgc/', conteudo: PNG } }))
  ok('enviar: guarda o arquivo', r.status === 200 && c.estado.arquivos.length === 1, { status: r.status, n: c.estado.arquivos.length })
  ok('  com o tamanho MEDIDO do conteúdo', c.estado.arquivos[0].tamanho === 75,
    c.estado.arquivos[0].tamanho)
  ok('  a pasta normalizada (sem barras sobrando)', c.estado.arquivos[0].pasta === 'scripts/sgc',
    c.estado.arquivos[0].pasta)
  ok('  o dono registrado', c.estado.arquivos[0].dono_id === ANA.id, c.estado.arquivos[0].dono_id)
  ok('  o conteúdo em OUTRO model', c.estado.conteudos.length === 1
    && c.estado.conteudos[0].arquivo_id === c.estado.arquivos[0].id, c.estado.conteudos.length)
  ok('  e o evento de auditoria', c.estado.eventos.length === 1
    && c.estado.eventos[0].acao === 'enviado' && c.estado.eventos[0].por === ANA.id, c.estado.eventos[0])

  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'enorme.pdf', conteudo: GRANDE } }))
  ok('acima de 10 MB: 400 com o tamanho na mensagem',
    r.status === 400 && /MB/.test(String(r.body?.error || '')), r.body?.error)
  ok('  e nada guardado', c.estado.arquivos.length === 0, c.estado.arquivos.length)

  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'virus.exe', conteudo: PROIBIDO } }))
  ok('tipo não aceito: 400 dizendo o tipo',
    r.status === 400 && String(r.body?.error || '').includes('x-msdownload'), r.body?.error)

  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: 'não é data uri' } }))
  ok('conteúdo que não é data URI: 400', r.status === 400, r.status)
  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: '  ', conteudo: PNG } }))
  ok('sem nome: 400', r.status === 400, r.status)
  c = cenario({ semModels: true })
  r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: PNG } }))
  ok('sem o schema da Fase 5: 503 com motivo', r.status === 503, r.status)

  // ══ listar: SÓ metadados, e a ACL vale ═════════════════════════════════
  const ACERVO = [
    { id: 'a1', nome: 'aberto.png', pasta: 'geral', tipo: 'image/png', tamanho: 10, dono_id: ANA.id, ativo: 'sim', criado_em: '2026-10-01T10:00:00Z' },
    { id: 'a2', nome: 'so-dev.png', pasta: 'geral', tipo: 'image/png', tamanho: 10, dono_id: DEV.id, acl_nivel: 'developer', ativo: 'sim', criado_em: '2026-10-02T10:00:00Z' },
    { id: 'a3', nome: 'so-qa.png', pasta: 'geral', tipo: 'image/png', tamanho: 10, dono_id: BIA.id, acl_grant: 'qa', ativo: 'sim', criado_em: '2026-10-03T10:00:00Z' },
    { id: 'a4', nome: 'apagado.png', pasta: 'geral', tipo: 'image/png', tamanho: 10, dono_id: ANA.id, ativo: 'nao', apagado_em: '2026-10-04T10:00:00Z' },
  ]
  c = cenario({ arquivos: ACERVO })
  r = await listar(c.ctx(ANA))
  let ids = (r.body?.data?.arquivos || []).map((a) => a.id).sort().join(',')
  ok('atendente vê só o que a ACL deixa', ids === 'a1', ids)
  ok('  e o conteúdo NUNCA vem na lista',
    !JSON.stringify(r.body?.data?.arquivos || []).includes('base64'), r.body?.data?.arquivos?.[0])
  ok('  nem o arquivo apagado', !ids.includes('a4'), ids)

  r = await listar(c.ctx(DEV))
  ids = (r.body?.data?.arquivos || []).map((a) => a.id).sort().join(',')
  ok('developer vê o de nível developer', ids === 'a1,a2', ids)

  r = await listar(c.ctx(BIA))
  ids = (r.body?.data?.arquivos || []).map((a) => a.id).sort().join(',')
  ok('quem tem o grant vê o restrito por grant', ids === 'a1,a3', ids)

  r = await listar(c.ctx(CHEFE))
  ids = (r.body?.data?.arquivos || []).map((a) => a.id).sort().join(',')
  ok('admin vê tudo que não está apagado', ids === 'a1,a2,a3', ids)

  r = await listar(c.ctx(CHEFE, { query: { pasta: 'nao-existe' } }))
  ok('pasta vazia devolve lista vazia, não erro',
    r.status === 200 && (r.body?.data?.arquivos || []).length === 0, r.status)

  ok('listar NÃO gera evento de auditoria', c.estado.eventos.length === 0, c.estado.eventos.length)

  // ══ baixar ═════════════════════════════════════════════════════════════
  c = cenario({ arquivos: ACERVO })
  r = await baixar(c.ctx(ANA, { params: { id: 'a1' } }))
  ok('baixar o permitido: vem o conteúdo', r.status === 200 && String(r.body?.data?.conteudo || '').startsWith('data:'), r.status)
  r = await baixar(c.ctx(ANA, { params: { id: 'a2' } }))
  ok('baixar por URL DIRETA o que a ACL proíbe: 403', r.status === 403, r.status)
  ok('  e sem conteúdo na resposta', !JSON.stringify(r.body || {}).includes('base64'), r.body)
  r = await baixar(c.ctx(ANA, { params: { id: 'a4' } }))
  ok('baixar apagado: 404', r.status === 404, r.status)
  r = await baixar(c.ctx(ANA, { params: { id: 'nao-existe' } }))
  ok('baixar inexistente: 404', r.status === 404, r.status)
  ok('baixar NÃO gera evento', c.estado.eventos.length === 0, c.estado.eventos.length)

  // ══ apagar: lógico, com evento ═════════════════════════════════════════
  c = cenario({ arquivos: ACERVO })
  r = await apagar(c.ctx(ANA, { params: { id: 'a1' } }))
  ok('o dono apaga o seu', r.status === 200, { status: r.status, body: r.body })
  const a1 = c.estado.arquivos.find((a) => a.id === 'a1')
  ok('  exclusão é LÓGICA: o registro fica', !!a1, !!a1)
  ok('  com apagado_em e apagado_por', !!a1.apagado_em && a1.apagado_por === ANA.id, a1)
  ok('  o CONTEÚDO sai', !c.estado.conteudos.some((x) => x.id === 'a1'), c.estado.conteudos.map((x) => x.id))
  ok('  e o evento registra quem e quando',
    c.estado.eventos.some((e) => e.acao === 'apagado' && e.por === ANA.id), c.estado.eventos)
  r = await listar(c.ctx(ANA))
  ok('  e ele desaparece da lista', !(r.body?.data?.arquivos || []).some((a) => a.id === 'a1'),
    (r.body?.data?.arquivos || []).map((a) => a.id))

  c = cenario({ arquivos: ACERVO })
  r = await apagar(c.ctx(BIA, { params: { id: 'a3' } }))
  ok('quem enviou apaga mesmo sem ser admin', r.status === 200, r.status)

  c = cenario({ arquivos: ACERVO })
  r = await apagar(c.ctx(CHEFE, { params: { id: 'a1' } }))
  ok('admin apaga o de outra pessoa', r.status === 200, r.status)

  // Quem só PODE VER não apaga o material de outra pessoa.
  c = cenario({ arquivos: ACERVO })
  r = await apagar(c.ctx(DEV, { params: { id: 'a1' } }))
  ok('quem só pode ver NÃO apaga o de outra pessoa', r.status === 403, { status: r.status, erro: r.body?.error })
  ok('  e o arquivo continua inteiro',
    !c.estado.arquivos.find((a) => a.id === 'a1').apagado_em
      && c.estado.conteudos.some((x) => x.id === 'a1'), c.estado.arquivos.find((a) => a.id === 'a1'))

  c = cenario({ arquivos: ACERVO })
  r = await apagar(c.ctx(ANA, { params: { id: 'a2' } }))
  ok('apagar o que a ACL esconde: 403', r.status === 403, r.status)

  // ══ BLOQUEIO 1: a ACL não pode falhar aberta ══════════════════════════
  // `acl_nivel` fora da régua caía em canonico()=="" e o arquivo ABRIA para
  // toda a equipe — fail-open no lugar exato onde o desenho prometia
  // restringir. Agora o POST recusa, e um registro antigo com ACL ilegível
  // fecha em vez de abrir.
  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: PNG, acl_nivel: 'administrador' } }))
  ok('ACL com nível desconhecido: 400 dizendo os válidos',
    r.status === 400 && /support|developer|admin/.test(String(r.body?.error || '')), r.body?.error)
  ok('  e nada guardado', c.estado.arquivos.length === 0, c.estado.arquivos.length)

  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: PNG, acl_grant: 'inventado' } }))
  ok('ACL com grant inexistente: 400 (trancaria o arquivo para todos)',
    r.status === 400, { status: r.status, erro: r.body?.error })

  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: PNG, acl_grant: 'wa_conta_vendas' } }))
  ok('grant de conta (padrão wa_conta_<id>) é aceito', r.status === 200, { status: r.status, erro: r.body?.error })

  // Registro ANTIGO com ACL ilegível: fecha, não abre.
  const ILEGIVEL = [{ id: 'z1', nome: 'herdado.png', pasta: '', tipo: 'image/png', tamanho: 10, dono_id: CHEFE.id, acl_nivel: 'administrador', ativo: 'sim', criado_em: '2026-09-01T10:00:00Z' }]
  c = cenario({ arquivos: ILEGIVEL })
  r = await listar(c.ctx(ANA))
  ok('ACL ilegível FECHA em vez de abrir (fail-closed)',
    (r.body?.data?.arquivos || []).length === 0, r.body?.data?.arquivos)
  r = await baixar(c.ctx(ANA, { params: { id: 'z1' } }))
  ok('  e o download dela é 403', r.status === 403, r.status)

  // ══ BLOQUEIO 1b: o DONO não pode ficar trancado fora ══════════════════
  const MEU_RESTRITO = [{ id: 'm1', nome: 'meu.png', pasta: '', tipo: 'image/png', tamanho: 10, dono_id: ANA.id, acl_nivel: 'admin', ativo: 'sim', criado_em: '2026-10-01T10:00:00Z' }]
  c = cenario({ arquivos: MEU_RESTRITO })
  r = await listar(c.ctx(ANA))
  ok('o DONO vê o próprio arquivo mesmo com ACL acima do nível dele',
    (r.body?.data?.arquivos || []).map((a) => a.id).join(',') === 'm1', r.body?.data?.arquivos)
  r = await baixar(c.ctx(ANA, { params: { id: 'm1' } }))
  ok('  e baixa', r.status === 200, r.status)
  c = cenario({ arquivos: MEU_RESTRITO })
  r = await apagar(c.ctx(ANA, { params: { id: 'm1' } }))
  ok('  e apaga', r.status === 200, { status: r.status, erro: r.body?.error })
  // E continua fechado para os outros.
  c = cenario({ arquivos: MEU_RESTRITO })
  r = await baixar(c.ctx(DEV, { params: { id: 'm1' } }))
  ok('  sem abrir para quem não é dono nem tem o nível', r.status === 403, r.status)

  // ══ BLOQUEIO 2: a listagem nunca varre ════════════════════════════════
  c = cenario({ arquivos: ACERVO })
  r = await listar(c.ctx(CHEFE))
  ok('listar sem pasta NÃO varre a tabela', c.estado.varreu === false, { varreu: c.estado.varreu })
  ok('  e ainda devolve os ativos',
    (r.body?.data?.arquivos || []).map((a) => a.id).sort().join(',') === 'a1,a2,a3',
    (r.body?.data?.arquivos || []).map((a) => a.id))

  c = cenario({ arquivos: ACERVO })
  r = await listar(c.ctx(CHEFE, { query: { pasta: 'geral' } }))
  ok('listar com pasta também não varre', c.estado.varreu === false, { varreu: c.estado.varreu })
  ok('  e o apagado não entra', !(r.body?.data?.arquivos || []).some((a) => a.id === 'a4'),
    (r.body?.data?.arquivos || []).map((a) => a.id))

  // Apagar troca o ESTADO, que é o campo do filtro.
  c = cenario({ arquivos: ACERVO })
  await apagar(c.ctx(ANA, { params: { id: 'a1' } }))
  const apagado = c.estado.arquivos.find((a) => a.id === 'a1')
  ok('apagar troca o estado filtrável para "nao"', apagado.ativo === 'nao', apagado.ativo)
  ok('  e marca que o conteúdo foi removido', apagado.conteudo_removido === true, apagado.conteudo_removido)

  // ══ guardas que faltavam ══════════════════════════════════════════════
  c = cenario({ arquivos: ACERVO })
  r = await baixar(c.ctx(null, { params: { id: 'a1' } }))
  ok('baixar sem sessão: 401', r.status === 401, r.status)
  r = await apagar(c.ctx(null, { params: { id: 'a1' } }))
  ok('apagar sem sessão: 401', r.status === 401, r.status)

  const CLIENTE = { id: 'u-cli', role: 'user', feature_grants: [] }
  c = cenario({ arquivos: ACERVO, perfis: [CLIENTE] })
  r = await listar(c.ctx(CLIENTE))
  ok('nível user: 403 na listagem', r.status === 403, r.status)
  r = await baixar(c.ctx(CLIENTE, { params: { id: 'a1' } }))
  ok('nível user: 403 no download', r.status === 403, r.status)
  r = await enviar(c.ctx(CLIENTE, { body: { nome: 'x.png', conteudo: PNG } }))
  ok('nível user: 403 no envio', r.status === 403, r.status)

  // ══ data URI de verdade ═══════════════════════════════════════════════
  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: 'data:image/png,naoebase64' } }))
  ok('data URI sem ;base64: 400', r.status === 400, { status: r.status, erro: r.body?.error })
  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: 'data:image/png;base64,<<<lixo>>>' } }))
  ok('base64 com alfabeto inválido: 400', r.status === 400, { status: r.status, erro: r.body?.error })

  // ══ nome e pasta com teto e limpeza ═══════════════════════════════════
  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: '../../etc/passwd\u0000.png', pasta: '../..//x\\y', conteudo: PNG } }))
  ok('nome e pasta limpos de .., barra e controle',
    !c.estado.arquivos[0].nome.includes('..') && !c.estado.arquivos[0].nome.includes('/')
      && !c.estado.arquivos[0].pasta.includes('..'),
    { nome: c.estado.arquivos[0]?.nome, pasta: c.estado.arquivos[0]?.pasta })
  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'a'.repeat(500) + '.png', conteudo: PNG } }))
  ok('nome com teto de 120', c.estado.arquivos[0].nome.length === 120, c.estado.arquivos[0]?.nome?.length)

  // ══ cursor e truncado ═════════════════════════════════════════════════
  const MUITOS = []
  for (let i = 0; i < 120; i++) {
    MUITOS.push({ id: 'x' + String(i).padStart(3, '0'), nome: 'f' + i + '.png', pasta: '', tipo: 'image/png', tamanho: 1, dono_id: ANA.id, ativo: 'sim', criado_em: '2026-10-01T10:' + String(i % 60).padStart(2, '0') + ':00Z' })
  }
  c = cenario({ arquivos: MUITOS })
  r = await listar(c.ctx(ANA))
  ok('página tem no máximo 50', (r.body?.data?.arquivos || []).length === 50, (r.body?.data?.arquivos || []).length)
  ok('  e devolve cursor quando há mais', !!r.body?.data?.cursor, r.body?.data?.cursor)
  const p1 = (r.body?.data?.arquivos || []).map((a) => a.id)
  r = await listar(c.ctx(ANA, { query: { cursor: r.body.data.cursor } }))
  const p2 = (r.body?.data?.arquivos || []).map((a) => a.id)
  ok('  a página seguinte não repete a primeira',
    p2.length > 0 && !p2.some((id) => p1.includes(id)), { p1: p1.slice(0, 2), p2: p2.slice(0, 2) })

  // ══ as opções que a TELA oferece são as que o servidor aceita ═════════
  // O seletor "Quem pode ver" manda nível ou grant; se a lista da tela e a
  // régua do servidor divergirem, a pessoa escolhe uma opção e leva 400.
  for (const nivel of ['developer', 'admin']) {
    c = cenario()
    r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: PNG, acl_nivel: nivel } }))
    ok(`a tela oferece "Nível mínimo: ${nivel}" e o servidor aceita`, r.status === 200,
      { status: r.status, erro: r.body?.error })
    ok(`  e grava o nível`, c.estado.arquivos[0]?.acl_nivel === nivel, c.estado.arquivos[0]?.acl_nivel)
  }
  // Os cinco grants do catálogo que a tela lista.
  for (const grant of ['qa', 'code_review', 'planejamento', 'cadastro_empresa', 'wa_flow_editor']) {
    c = cenario()
    r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: PNG, acl_grant: grant } }))
    ok(`grant do catálogo "${grant}" é aceito`, r.status === 200, { status: r.status, erro: r.body?.error })
  }
  // E o grant de conta, que a tela monta a partir das contas ativas.
  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: PNG, acl_grant: 'wa_conta_adm' } }))
  ok('grant de conta (wa_conta_<id>) é aceito', r.status === 200, { status: r.status, erro: r.body?.error })
  // `support` NÃO é oferecido pela tela: equivale a "toda a equipe", que é o
  // padrão. O servidor aceita, e o teste registra isso para ninguém achar que
  // a ausência na tela é um bloqueio.
  c = cenario()
  r = await enviar(c.ctx(ANA, { body: { nome: 'x.png', conteudo: PNG, acl_nivel: 'support' } }))
  ok('"support" é aceito pelo servidor, mas a tela não o oferece (= toda a equipe)',
    r.status === 200, r.status)

  fim()
})()
