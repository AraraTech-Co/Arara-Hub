// Só o master concede permissão extra, e só o master dá ou tira o papel master.
//
// Decisão do Leonardo (29/10/2026). A rota é a 286 `PUT /profiles/:id`, que é
// a ÚNICA dos 510 handlers que grava `feature_grants` num Profile a partir do
// corpo — as outras rotas de perfil montam os campos explicitamente, e a 285
// `POST /profiles/:id/role` é um stub 501 que não grava nada.
//
// AS DUAS REGRAS TÊM FORMAS DIFERENTES, e os casos abaixo cobrem as duas:
//   - permissão extra é DESCARTADA do corpo de quem não é master. A tela manda
//     `feature_grants` em todo salvar; recusar faria o admin não editar nada;
//   - papel master é RECUSADO com 403, e só quando o papel MUDA. A tela
//     oferece "Master" no seletor, e um descarte calado deixaria o admin
//     escolher, salvar e achar que promoveu alguém.
//
// A checagem é no papel CRU: `_APELIDOS` mapeia master → admin, então o nível
// não distingue os dois e `_canon("master")` devolve "admin".
//
// Roda com: node profiles-permissao-master.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const ROTA = '286 profiles PUT /profiles/:id'

function montar({ eu, alvo, body }) {
  const reg = { update: [], findById: [] }
  const perfis = {}
  perfis[eu.id] = eu
  if (alvo && alvo.id !== eu.id) perfis[alvo.id] = alvo
  const ctx = {
    headers: {},
    user: { id: eu.id },
    params: { id: (alvo || eu).id },
    query: {},
    body: body,
    reply: reply(),
    models: {
      Profile: {
        findById: async (id) => { reg.findById.push(String(id)); return perfis[String(id)] || null },
        update: async (id, dados) => {
          reg.update.push({ id: String(id), dados })
          return Object.assign({}, perfis[String(id)], dados)
        },
      },
      Sessao: { findById: async () => null },
    },
  }
  return { ctx, reg }
}

const MASTER = {
  id: 'm1', role: 'master', full_name: 'Chefe', feature_grants: [],
  phone: '5519999990001', email: 'chefe@arara-tech.com',
  // `active` faz parte do perfil de verdade. Sem ele, mudar para `false` não
  // contaria como mudança e o caso mediria outra coisa.
  active: true, expires_at: null,
}
const ADMIN = { id: 'a1', role: 'admin', full_name: 'Adm', feature_grants: [], active: true }
const DEV = { id: 'd1', role: 'developer', full_name: 'Dev', feature_grants: [], active: true }
const SUPORTE = { id: 's1', role: 'support', full_name: 'Sup', feature_grants: [] }

const copia = (p, extra) => Object.assign({}, p, extra || {})

;(async () => {
  const handler = carregarHandler(ROTA)

  // ── 1. Permissão extra: só o master grava ─────────────────────────────────
  {
    const corpo = { full_name: 'Dev', feature_grants: ['planejamento'] }

    const comoAdmin = montar({ eu: copia(ADMIN), alvo: copia(DEV), body: Object.assign({}, corpo) })
    const rA = await handler(comoAdmin.ctx)
    const gravadoA = (comoAdmin.reg.update[0] || {}).dados || {}
    ok('admin-nao-grava-permissao-extra',
      gravadoA.feature_grants === undefined && gravadoA.featureGrants === undefined, gravadoA)
    // E o resto do salvar continua funcionando: o admin não pode ser travado
    // só porque a tela manda o campo junto.
    ok('admin-continua-editando-o-resto',
      rA.status !== 403 && gravadoA.full_name === 'Dev', { status: rA.status, gravadoA })

    const comoMaster = montar({ eu: copia(MASTER), alvo: copia(DEV), body: Object.assign({}, corpo) })
    const rM = await handler(comoMaster.ctx)
    const gravadoM = (comoMaster.reg.update[0] || {}).dados || {}
    ok('master-grava-permissao-extra',
      Array.isArray(gravadoM.feature_grants)
      && gravadoM.feature_grants.join(',') === 'planejamento', gravadoM)
    ok('master-nao-leva-403', rM.status !== 403, rM.status)

    // A grafia camelCase não pode ser a porta dos fundos.
    const camel = montar({
      eu: copia(ADMIN), alvo: copia(DEV),
      body: { full_name: 'Dev', featureGrants: ['planejamento'] },
    })
    await handler(camel.ctx)
    const gravadoC = (camel.reg.update[0] || {}).dados || {}
    ok('admin-nao-grava-nem-na-grafia-camelCase',
      gravadoC.featureGrants === undefined && gravadoC.feature_grants === undefined, gravadoC)

    // Quem não é admin continua sem gravar nada disso no próprio perfil.
    const eu = copia(DEV)
    const proprio = montar({ eu, alvo: eu, body: { full_name: 'Dev', feature_grants: ['qa'], role: 'admin' } })
    await handler(proprio.ctx)
    const gravadoP = (proprio.reg.update[0] || {}).dados || {}
    ok('nao-admin-nao-grava-permissao-nem-papel',
      gravadoP.feature_grants === undefined && gravadoP.role === undefined, gravadoP)
  }

  // ── 2. O papel master: só o master dá ou tira ─────────────────────────────
  {
    // Admin tentando PROMOVER alguém a master.
    const promover = montar({ eu: copia(ADMIN), alvo: copia(DEV), body: { role: 'master' } })
    const rP = await handler(promover.ctx)
    ok('admin-nao-promove-a-master', rP.status === 403, { status: rP.status, body: rP.body })
    ok('admin-nao-promove-a-master-nao-grava', promover.reg.update.length === 0, promover.reg.update)

    // Admin tentando REBAIXAR um master — tirar é tão grave quanto dar.
    const rebaixar = montar({ eu: copia(ADMIN), alvo: copia(MASTER), body: { role: 'admin' } })
    const rR = await handler(rebaixar.ctx)
    ok('admin-nao-rebaixa-master', rR.status === 403, { status: rR.status, body: rR.body })
    ok('admin-nao-rebaixa-master-nao-grava', rebaixar.reg.update.length === 0, rebaixar.reg.update)

    // Admin tentando virar master a SI MESMO: é o caminho curto para a trava
    // de permissão não valer nada.
    const euMesmo = copia(ADMIN)
    const auto = montar({ eu: euMesmo, alvo: euMesmo, body: { role: 'master' } })
    const rAuto = await handler(auto.ctx)
    ok('admin-nao-se-promove-a-master', rAuto.status === 403, { status: rAuto.status })
    ok('admin-nao-se-promove-nao-grava', auto.reg.update.length === 0, auto.reg.update)

    // O que o admin CONTINUA podendo: mexer nos outros papéis.
    const outros = montar({ eu: copia(ADMIN), alvo: copia(SUPORTE), body: { role: 'developer' } })
    const rO = await handler(outros.ctx)
    ok('admin-continua-mudando-os-outros-papeis',
      rO.status !== 403 && ((outros.reg.update[0] || {}).dados || {}).role === 'developer',
      { status: rO.status, reg: outros.reg.update })

    // E editar um master sem MUDAR o papel: a tela manda `role` em todo
    // salvar, e recusar aqui travaria o admin em qualquer master.
    const semMudar = montar({
      eu: copia(ADMIN), alvo: copia(MASTER),
      body: { full_name: 'Chefe novo', role: 'master' },
    })
    const rS = await handler(semMudar.ctx)
    ok('admin-edita-master-sem-mudar-o-papel',
      rS.status !== 403 && ((semMudar.reg.update[0] || {}).dados || {}).full_name === 'Chefe novo',
      { status: rS.status, reg: semMudar.reg.update })

    // O master faz as duas coisas.
    const masterPromove = montar({ eu: copia(MASTER), alvo: copia(DEV), body: { role: 'master' } })
    const rMP = await handler(masterPromove.ctx)
    ok('master-promove-a-master',
      rMP.status !== 403 && ((masterPromove.reg.update[0] || {}).dados || {}).role === 'master',
      { status: rMP.status, reg: masterPromove.reg.update })
    const masterRebaixa = montar({
      eu: copia(MASTER), alvo: copia(MASTER, { id: 'm2' }), body: { role: 'admin' },
    })
    const rMR = await handler(masterRebaixa.ctx)
    ok('master-rebaixa-outro-master', rMR.status !== 403, { status: rMR.status })
  }

  // ── 2b. O papel vindo do CORPO também é normalizado ──────────────────────
  //
  // Sem normalizar o que vem do corpo, "Master" ou " MASTER " não casariam com
  // "master" na comparação e seriam GRAVADOS — e `_souMaster`, que normaliza,
  // passaria a contar essa pessoa como master. O caso do papel cru do bloco 3
  // cobre o papel de QUEM CHAMA, não o que vem no corpo.
  {
    for (const grafia of ['Master', ' MASTER ', 'MaStEr', 'master ']) {
      const m = montar({ eu: copia(ADMIN), alvo: copia(DEV), body: { role: grafia } })
      const r = await handler(m.ctx)
      ok('papel-do-corpo-normalizado:' + JSON.stringify(grafia), r.status === 403,
        { grafia, status: r.status, body: r.body })
      ok('papel-do-corpo-normalizado:' + JSON.stringify(grafia) + '-nao-grava',
        m.reg.update.length === 0, m.reg.update)
    }
    // E rebaixar um master com grafia diferente também é recusado.
    const reb = montar({ eu: copia(ADMIN), alvo: copia(MASTER, { role: 'Master' }), body: { role: 'admin' } })
    const rReb = await handler(reb.ctx)
    ok('rebaixar-master-escrito-com-maiuscula-recusa', rReb.status === 403, { status: rReb.status })
  }

  // ── 2c. Os campos que decidem para onde vai o código de senha ────────────
  //
  // `POST /auth/senha/solicitar` acha o perfil pelo EMAIL e manda o código para
  // o `phone` do cadastro. Quem trocar o telefone de um master recebe o código
  // e entra como ele — sem nunca ter mudado papel nem permissão. Esta é a
  // trava que fecha o caminho.
  {
    // Admin trocando o telefone de um master.
    const fone = montar({ eu: copia(ADMIN), alvo: copia(MASTER), body: { phone: '5511888880000' } })
    const rF = await handler(fone.ctx)
    ok('admin-nao-troca-o-telefone-de-um-master', rF.status === 403, { status: rF.status, body: rF.body })
    ok('admin-nao-troca-o-telefone-nao-grava', fone.reg.update.length === 0, fone.reg.update)

    // E o email, que é por onde a recuperação acha o perfil.
    const mail = montar({ eu: copia(ADMIN), alvo: copia(MASTER), body: { email: 'eu@attacker.com' } })
    const rM = await handler(mail.ctx)
    ok('admin-nao-troca-o-email-de-um-master', rM.status === 403, { status: rM.status })
    ok('admin-nao-troca-o-email-nao-grava', mail.reg.update.length === 0, mail.reg.update)

    // O que o admin CONTINUA podendo: editar o nome de um master mandando o
    // mesmo telefone e o mesmo email, que é o que a tela manda em todo salvar.
    const nome = montar({
      eu: copia(ADMIN), alvo: copia(MASTER),
      body: { full_name: 'Chefe novo', phone: MASTER.phone, email: MASTER.email },
    })
    const rN = await handler(nome.ctx)
    ok('admin-edita-o-nome-de-um-master-mandando-o-resto-igual',
      rN.status !== 403 && ((nome.reg.update[0] || {}).dados || {}).full_name === 'Chefe novo',
      { status: rN.status, reg: nome.reg.update })

    // Formato diferente, MESMOS dígitos: a tela manda "+55 (19) 99999-0001" e
    // o banco guarda "5519999990001". Comparar como texto acusaria mudança
    // onde não houve e travaria o salvar.
    const formato = montar({
      eu: copia(ADMIN), alvo: copia(MASTER),
      body: { full_name: 'Chefe', phone: '+55 (19) 99999-0001' },
    })
    const rFo = await handler(formato.ctx)
    ok('telefone-no-mesmo-numero-com-outro-formato-passa', rFo.status !== 403,
      { status: rFo.status, body: rFo.body })

    // Email com maiúscula e espaço é o mesmo email.
    const mailIgual = montar({
      eu: copia(ADMIN), alvo: copia(MASTER),
      body: { full_name: 'Chefe', email: '  CHEFE@arara-tech.com ' },
    })
    ok('email-igual-em-outra-grafia-passa', (await handler(mailIgual.ctx)).status !== 403, null)

    // O master troca o de outro master.
    const entreMasters = montar({
      eu: copia(MASTER), alvo: copia(MASTER, { id: 'm2' }), body: { phone: '5511888880000' },
    })
    const rE = await handler(entreMasters.ctx)
    ok('master-troca-o-telefone-de-outro-master', rE.status !== 403, { status: rE.status })

    // E o próprio master muda o seu: a trava é sobre mexer no de OUTRO.
    const eu = copia(MASTER)
    const proprio = montar({ eu, alvo: eu, body: { phone: '5511888880000' } })
    const rP = await handler(proprio.ctx)
    ok('o-proprio-master-muda-o-seu-telefone',
      rP.status !== 403 && ((proprio.reg.update[0] || {}).dados || {}).phone === '5511888880000',
      { status: rP.status, reg: proprio.reg.update })

    // Alvo que NÃO é master segue editável pelo admin: a trava é sobre master.
    const outro = montar({ eu: copia(ADMIN), alvo: copia(DEV), body: { phone: '5511888880000' } })
    ok('admin-continua-trocando-o-telefone-de-quem-nao-e-master',
      (await handler(outro.ctx)).status !== 403, null)
  }

  // ── 3. O papel cru, e não o nível ─────────────────────────────────────────
  //
  // `_APELIDOS` mapeia master → admin: o nível de um master é IGUAL ao de um
  // admin. Se a trava olhasse o nível, ela não existiria.
  {
    for (const [nome, papel, podeConceder] of [
      ['master', 'master', true],
      ['Master-com-maiuscula', 'Master', true],
      ['master-com-espaco', '  master  ', true],
      ['admin', 'admin', false],
      ['gerente-que-e-apelido-de-admin', 'gerente', false],
    ]) {
      const m = montar({
        eu: copia(MASTER, { role: papel }), alvo: copia(DEV),
        body: { full_name: 'x', feature_grants: ['qa'] },
      })
      await handler(m.ctx)
      const gravado = (m.reg.update[0] || {}).dados || {}
      const concedeu = Array.isArray(gravado.feature_grants)
      ok('papel-cru:' + nome + (podeConceder ? '-concede' : '-nao-concede'),
        concedeu === podeConceder, { nome, papel, gravado })
    }
  }

  // ── 4. O texto do handler não volta a olhar o nível ───────────────────────
  {
    const { ARQ } = require('./_carregar.js')
    const fs = require('node:fs')
    const texto = fs.readFileSync(ARQ, 'utf8')
    const at = texto.indexOf('// 286 profiles PUT /profiles/:id')
    const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
    re.lastIndex = at
    const cod = JSON.parse('"' + re.exec(texto)[1] + '"')
    // Sem comentários: os comentários EXPLICAM a regra e citam os mesmos
    // nomes que a busca procura.
    const semComentario = cod.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    ok('a-trava-existe-no-handler', semComentario.includes('_souMaster'), null)
    ok('a-trava-compara-o-papel-cru',
      /_souMaster = String\(\(_meu && _meu\.role\) \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "master"/
        .test(semComentario), null)
    ok('a-trava-nao-usa-canon-nem-nivel',
      !/_souMaster[^\n]*_canon/.test(semComentario) && !/_souMaster[^\n]*_RANK/.test(semComentario), null)
    ok('a-trava-vem-antes-da-gravacao',
      semComentario.indexOf('_souMaster') < semComentario.indexOf('await model.update(id, _corpo)'), null)
  }

  // ── 5. A tela não oferece o que a rota recusa ─────────────────────────────
  //
  // O seletor de papel oferecia "Master" a quem estivesse editando, inclusive
  // ao admin: ele escolheria, salvaria, veria "usuário atualizado" e levaria
  // 403 sem entender. É o mesmo desenho dos outros grants — a tela esconde o
  // que o servidor vai recusar, e o servidor continua sendo a verdade.
  {
    const { semComentarios } = require('./_tela.js')
    const tela = semComentarios('_components/admin/users-manager.tsx')
    ok('o-item-master-e-condicional',
      /\{\(isMaster \|\| editRole === 'master'\) && \(/.test(tela), null)
    ok('o-seletor-trava-para-quem-nao-e-master',
      /disabled=\{!isMaster && editRole === 'master'\}/.test(tela), null)
    // O item continua existindo para o master já gravado aparecer no rótulo.
    ok('o-item-master-nao-foi-apagado', tela.includes('value="master">Master<'), null)

    // O telefone travado nas MESMAS condições do servidor: é por ele que chega
    // o código de recuperação.
    ok('a-tela-calcula-mexendo-em-master-alheio',
      /const mexendoEmMasterAlheio = useMemo\(/.test(tela), null)
    ok('a-condicao-usa-o-papel-cru-do-alvo',
      /String\(editUser\?\.role \?\? ''\)\.trim\(\)\.toLowerCase\(\) !== 'master'/.test(tela), null)
    ok('a-condicao-deixa-o-proprio-master-passar',
      /String\(editUser\?\.id \?\? ''\) !== String\(authUser\?\.id \?\? ''\)/.test(tela), null)
    ok('o-telefone-fica-travado', /disabled=\{mexendoEmMasterAlheio\}/.test(tela), null)
    ok('a-tela-explica-por-que-travou', tela.includes('código de recuperação de senha'), null)
  }

  // ── 6. POST /admin/membros: a senha da plataforma ────────────────────────
  //
  // Esta rota troca a SENHA da conta (`ctx.users.setPassword`). Com o e-mail de
  // um master e o campo `senha`, um admin redefinia a senha dele direto — sem
  // papel, sem permissão e sem a recuperação no meio. E a leitura do perfil
  // acontecia DEPOIS da troca, então nem a ordem protegia.
  {
    const h490b = carregarHandler('490b profiles POST /admin/membros')

    function montarMembros({ eu, alvo, body }) {
      const reg = { setPassword: [], update: [], create: [] }
      const perfis = {}
      perfis[eu.id] = eu
      if (alvo) perfis[alvo.id] = alvo
      const ctx = {
        headers: {}, user: { id: eu.id }, params: {}, query: {}, body,
        reply: reply(),
        models: {
          Profile: {
            findById: async (id) => perfis[String(id)] || null,
            update: async (id, dados) => { reg.update.push({ id: String(id), dados }); return dados },
            create: async (dados) => { reg.create.push(dados); return dados },
          },
          Sessao: { findById: async () => null },
        },
        users: {
          findByEmail: async (email) => {
            const achado = Object.values(perfis).find(
              (p) => String(p.email || '').toLowerCase() === String(email).toLowerCase())
            return achado ? { id: achado.id, status: 'active' } : null
          },
          // Registrado para o caso poder afirmar que a senha NÃO foi trocada.
          setPassword: async (uid, senha) => { reg.setPassword.push({ uid, senha }) },
        },
      }
      return { ctx, reg }
    }

    const corpo = (email) => ({
      email, nome: 'Alguém', role: 'admin', senha: 'senhaforte123',
    })

    // Admin re-adicionando um master com senha.
    const m = montarMembros({ eu: copia(ADMIN), alvo: copia(MASTER), body: corpo(MASTER.email) })
    const r = await h490b(m.ctx)
    ok('admin-nao-re-adiciona-master', r.status === 403, { status: r.status, body: r.body })
    // A prova que importa: a senha não foi trocada. Um 403 depois do
    // `setPassword` não serviria de nada.
    ok('admin-nao-re-adiciona-master-nao-troca-a-senha', m.reg.setPassword.length === 0, m.reg.setPassword)
    ok('admin-nao-re-adiciona-master-nao-grava-perfil',
      m.reg.update.length === 0 && m.reg.create.length === 0, m.reg)

    // Master re-adicionando um master: passa, e a senha é trocada.
    const mm = montarMembros({ eu: copia(MASTER), alvo: copia(MASTER, { id: 'm2', email: 'outro@x.com' }), body: corpo('outro@x.com') })
    const rmm = await h490b(mm.ctx)
    ok('master-re-adiciona-master', rmm.status !== 403, { status: rmm.status, body: rmm.body })
    ok('master-re-adiciona-master-troca-a-senha', mm.reg.setPassword.length === 1, mm.reg.setPassword)

    // Admin re-adicionando quem NÃO é master: continua como era.
    const md = montarMembros({ eu: copia(ADMIN), alvo: copia(DEV, { email: 'dev@x.com' }), body: corpo('dev@x.com') })
    const rmd = await h490b(md.ctx)
    ok('admin-re-adiciona-nao-master', rmd.status !== 403, { status: rmd.status, body: rmd.body })
    ok('admin-re-adiciona-nao-master-troca-a-senha', md.reg.setPassword.length === 1, md.reg.setPassword)

    // Master GRAVADO com outra grafia — dado antigo, de antes de a
    // normalização existir. Sem `trim().toLowerCase()` no papel do ALVO, o
    // admin passa por esta porta e troca a senha dele.
    for (const grafia of [' Master ', 'Master', 'MASTER', 'master ']) {
      const g_ = montarMembros({
        eu: copia(ADMIN), alvo: copia(MASTER, { role: grafia }), body: corpo(MASTER.email),
      })
      const rg = await h490b(g_.ctx)
      ok('490b-alvo-master-em-outra-grafia:' + JSON.stringify(grafia), rg.status === 403,
        { grafia, status: rg.status, body: rg.body })
      ok('490b-alvo-master-em-outra-grafia:' + JSON.stringify(grafia) + '-nao-troca-a-senha',
        g_.reg.setPassword.length === 0, g_.reg.setPassword)
      ok('490b-alvo-master-em-outra-grafia:' + JSON.stringify(grafia) + '-nao-grava',
        g_.reg.update.length === 0 && g_.reg.create.length === 0, g_.reg)
    }

    // E sem senha no corpo também é recusado: a rota troca o telefone do
    // perfil, que é por onde chega o código de recuperação.
    const sem = montarMembros({
      eu: copia(ADMIN), alvo: copia(MASTER),
      body: { email: MASTER.email, nome: 'Alguém', role: 'admin', phone: '5511888880000' },
    })
    const rsem = await h490b(sem.ctx)
    ok('admin-nao-re-adiciona-master-nem-sem-senha', rsem.status === 403, { status: rsem.status })
    ok('admin-nao-re-adiciona-master-sem-senha-nao-grava', sem.reg.update.length === 0, sem.reg.update)
  }

  // ── 7. POST /admin/membros/:id/ativacao ──────────────────────────────────
  //
  // Desativar um master é tirá-lo do ar.
  {
    const h490j = carregarHandler('490j profiles POST /admin/membros/:id/ativacao')

    function montarAtivacao({ eu, alvo, ativo }) {
      const reg = { update: [] }
      const perfis = {}
      perfis[eu.id] = eu
      perfis[alvo.id] = alvo
      const ctx = {
        headers: {}, user: { id: eu.id }, params: { id: alvo.id }, query: {},
        body: { ativo: ativo },
        reply: reply(),
        models: {
          Profile: {
            findById: async (id) => perfis[String(id)] || null,
            update: async (id, dados) => { reg.update.push({ id: String(id), dados }); return dados },
          },
          Sessao: { findById: async () => null, update: async () => ({}) },
          SessaoToken: { findMany: async () => [], update: async () => ({}) },
        },
      }
      return { ctx, reg }
    }

    const d = montarAtivacao({ eu: copia(ADMIN), alvo: copia(MASTER), ativo: false })
    const rd = await h490j(d.ctx)
    ok('admin-nao-desativa-master', rd.status === 403, { status: rd.status, body: rd.body })
    ok('admin-nao-desativa-master-nao-grava', d.reg.update.length === 0, d.reg.update)

    // Ativar também é do master: quem não pode desativar não pode reativar.
    const a_ = montarAtivacao({ eu: copia(ADMIN), alvo: copia(MASTER, { active: false }), ativo: true })
    ok('admin-nao-reativa-master', (await h490j(a_.ctx)).status === 403, null)

    // O master faz.
    const mm = montarAtivacao({ eu: copia(MASTER), alvo: copia(MASTER, { id: 'm2' }), ativo: false })
    ok('master-desativa-outro-master', (await h490j(mm.ctx)).status !== 403, null)

    // Master GRAVADO com outra grafia, pelo mesmo motivo da 490b.
    for (const grafia of [' Master ', 'Master', 'MASTER', 'master ']) {
      const g_ = montarAtivacao({
        eu: copia(ADMIN), alvo: copia(MASTER, { role: grafia }), ativo: false,
      })
      const rg = await h490j(g_.ctx)
      ok('490j-alvo-master-em-outra-grafia:' + JSON.stringify(grafia), rg.status === 403,
        { grafia, status: rg.status, body: rg.body })
      ok('490j-alvo-master-em-outra-grafia:' + JSON.stringify(grafia) + '-nao-grava',
        g_.reg.update.length === 0, g_.reg.update)
    }

    // E quem não é master segue desativável pelo admin.
    const nd = montarAtivacao({ eu: copia(ADMIN), alvo: copia(DEV), ativo: false })
    const rnd = await h490j(nd.ctx)
    ok('admin-continua-desativando-quem-nao-e-master', rnd.status !== 403, { status: rnd.status, body: rnd.body })
  }

  // ── 8. Na 286: desativar e expirar um master ─────────────────────────────
  {
    const desativa = montar({ eu: copia(ADMIN), alvo: copia(MASTER), body: { active: false } })
    const rD = await handler(desativa.ctx)
    ok('admin-nao-desativa-master-pela-286', rD.status === 403, { status: rD.status, body: rD.body })
    ok('admin-nao-desativa-master-pela-286-nao-grava', desativa.reg.update.length === 0, desativa.reg.update)

    const expira = montar({ eu: copia(ADMIN), alvo: copia(MASTER), body: { expires_at: '2026-11-01' } })
    const rE = await handler(expira.ctx)
    ok('admin-nao-expira-master', rE.status === 403, { status: rE.status })
    ok('admin-nao-expira-master-nao-grava', expira.reg.update.length === 0, expira.reg.update)

    // Valor igual passa: a tela manda `expires_at` em todo salvar.
    const igual = montar({
      eu: copia(ADMIN), alvo: copia(MASTER, { expires_at: '2026-12-31' }),
      body: { full_name: 'Chefe novo', expires_at: '2026-12-31', active: true },
    })
    const rI = await handler(igual.ctx)
    ok('admin-edita-master-mandando-a-mesma-validade',
      rI.status !== 403 && ((igual.reg.update[0] || {}).dados || {}).full_name === 'Chefe novo',
      { status: rI.status, reg: igual.reg.update })

    // Data de calendário contra timestamp: o mesmo dia não é mudança.
    const comHora = montar({
      eu: copia(ADMIN), alvo: copia(MASTER, { expires_at: '2026-12-31T00:00:00.000Z' }),
      body: { full_name: 'Chefe', expires_at: '2026-12-31' },
    })
    ok('mesma-data-com-e-sem-hora-nao-e-mudanca', (await handler(comHora.ctx)).status !== 403, null)

    // O mesmo na 286: alvo master gravado com outra grafia continua protegido
    // nos campos de acesso, não só no papel.
    for (const grafia of [' Master ', 'MASTER']) {
      const g_ = montar({
        eu: copia(ADMIN), alvo: copia(MASTER, { role: grafia }), body: { phone: '5511888880000' },
      })
      const rg = await handler(g_.ctx)
      ok('286-alvo-master-em-outra-grafia-protege-o-telefone:' + JSON.stringify(grafia),
        rg.status === 403, { grafia, status: rg.status })
      ok('286-alvo-master-em-outra-grafia-nao-grava:' + JSON.stringify(grafia),
        g_.reg.update.length === 0, g_.reg.update)
    }

    // Alvo que não é master segue desativável.
    const outro = montar({ eu: copia(ADMIN), alvo: copia(DEV), body: { active: false } })
    ok('admin-continua-desativando-nao-master-pela-286',
      (await handler(outro.ctx)).status !== 403, null)
  }

  fim()
})()
