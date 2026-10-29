// O campo de telefone em Editar membro — digitar tecla a tecla.
//
// DEFEITO RELATADO (29/10): "começo a digitar e ele começa a preencher com 2
// números 55 a cada número que eu digito".
//
// A máscara mostra `+55 …`. O campo de Editar membro guardava só os DÍGITOS do
// valor mostrado, o que joga fora o `+`; e `telefoneParteLocal` só trata um
// `55` inicial como DDI quando o texto começa com `+` ou já tem 12 dígitos.
// Resultado: o `55` da própria máscara entrava no número e era prefixado de
// novo a cada tecla — até o corte de 11 dígitos congelar o campo num valor
// corrompido. As outras seis telas guardam o valor MASCARADO, que preserva o
// `+`, e por isso nunca tiveram o problema.
//
// Este teste EXECUTA as funções e simula a digitação. E amarra o call site:
// não basta a função estar certa se a tela a chama de um jeito que perde o `+`.
//
// Roda com: node telefone-em-editar-membro.test.js
const { ok, fim } = require('./_carregar.js')
const { registrarTS, importarTela, semComentarios } = require('./_tela.js')

registrarTS()

const ESPERADO = '+55 (11) 98765-4321'

;(async () => {
  const U = await importarTela('lib/utils.ts')

  // Como a tela passa a guardar: o valor MASCARADO, igual às outras seis.
  const digitar = (teclas, inicio = '') => {
    let estado = inicio
    for (const t of teclas) estado = U.mascaraTelefone(estado + t)
    return estado
  }

  // ── 1. Digitar tecla a tecla ──────────────────────────────────────────────
  {
    const fim_ = digitar('11987654321')
    ok('digitar-tecla-a-tecla-termina-no-numero-certo', fim_ === ESPERADO, fim_)
    // O caso do relato, dito por extenso: nenhum passo intermediário pode ter
    // um 55 a mais. Com o defeito, a 2ª tecla já virava "+55 (55) 11".
    const passos = []
    let e = ''
    for (const t of '11987654321') { e = U.mascaraTelefone(e + t); passos.push(e) }
    const comDDDcinquentaecinco = passos.filter((p) => p.includes('(55)'))
    ok('nenhum-passo-ganha-um-55-a-mais', comDDDcinquentaecinco.length === 0,
      comDDDcinquentaecinco)
    ok('o-campo-nao-congela-antes-do-fim',
      new Set(passos).size === passos.length, passos)
  }

  // ── 2. Colar ──────────────────────────────────────────────────────────────
  {
    ok('colar-o-numero-inteiro', U.mascaraTelefone('11987654321') === ESPERADO,
      U.mascaraTelefone('11987654321'))
    ok('colar-com-ddi-nao-duplica', U.mascaraTelefone('5511987654321') === ESPERADO,
      U.mascaraTelefone('5511987654321'))
    ok('colar-do-whatsapp-com-mais-e-espacos',
      U.mascaraTelefone('+55 11 98765-4321') === ESPERADO,
      U.mascaraTelefone('+55 11 98765-4321'))
    // DDD 55 existe (Santa Maria/RS): 11 dígitos começando com 55 são número
    // local, não DDI. Tratar como DDI comeria o DDD.
    // Colar lixo mais longo que um número brasileiro: o corte em 11 é o que
    // impede a máscara de produzir um número que não existe.
    ok('colar-mais-digitos-do-que-cabe-para-em-onze',
      U.telefoneParteLocal('1198765432199').length === 11,
      U.telefoneParteLocal('1198765432199'))
    ok('ddd-55-nao-e-confundido-com-ddi',
      U.mascaraTelefone('55987654321') === '+55 (55) 98765-4321',
      U.mascaraTelefone('55987654321'))
  }

  // ── 3. Apagar e corrigir no meio ──────────────────────────────────────────
  {
    const cheio = digitar('11987654321')
    // Apagar o último caractere mostrado e digitar outro dígito.
    const semUltimo = U.mascaraTelefone(cheio.slice(0, -1))
    const corrigido = U.mascaraTelefone(semUltimo + '9')
    ok('apagar-o-ultimo-e-digitar-de-novo', corrigido === '+55 (11) 98765-4329', corrigido)
    // Apagar tudo volta a vazio, e não a "+55".
    ok('apagar-tudo-deixa-o-campo-vazio', U.mascaraTelefone('') === '', U.mascaraTelefone(''))
    // Corrigir no meio: troca o DDD de 11 para 19.
    const trocado = U.mascaraTelefone('19987654321')
    ok('trocar-o-ddd-no-meio', trocado === '+55 (19) 98765-4321', trocado)
  }

  // ── 4. O que vai para o servidor ──────────────────────────────────────────
  {
    // O PUT manda `editPhone.replace(/\D/g, '')`. Com o valor mascarado no
    // estado, isso dá 13 dígitos — dentro do 10 a 13 que o handler 286 exige.
    const digitos = digitar('11987654321').replace(/\D/g, '')
    ok('o-que-vai-ao-servidor-tem-13-digitos', digitos === '5511987654321', digitos)
    ok('o-que-vai-ao-servidor-cabe-no-limite-do-handler',
      digitos.length >= 10 && digitos.length <= 13, digitos.length)
    // Fixo de 10 dígitos também passa.
    const fixo = digitar('1933334444').replace(/\D/g, '')
    ok('fixo-de-dez-digitos-tambem-cabe', fixo.length >= 10 && fixo.length <= 13, fixo)
  }

  // ── 5. O call site: a tela não pode perder o `+` ──────────────────────────
  {
    const tela = semComentarios('_components/admin/users-manager.tsx')
    const linha = tela.split('\n').find((l) => l.includes('setEditPhone(') && l.includes('e.target.value'))
    ok('achou-o-onChange-do-telefone', !!linha, linha)
    ok('o-onChange-guarda-o-valor-mascarado',
      !!linha && linha.includes('mascaraTelefone(e.target.value)'), linha)
    // Guardar só os dígitos é exatamente o que causava o defeito: o `+` se
    // perde e o 55 da máscara entra no número.
    ok('o-onChange-nao-guarda-so-os-digitos',
      !!linha && !linha.includes('soDigitosTelefone(e.target.value)'), linha)
    ok('o-value-do-campo-e-o-proprio-estado',
      /value=\{editPhone\}/.test(tela), null)
    // Carregar o perfil tem de entrar formatado, senão o primeiro render já
    // mostra dígitos crus e a primeira tecla reabre o problema.
    // `setEditPhone(mascaraTelefone(` casa TAMBÉM no onChange, que chama a
    // mesma função: a âncora tem de ser o argumento, senão a asserção passa
    // com o carregamento cru.
    ok('carregar-o-membro-entra-formatado',
      /setEditPhone\(mascaraTelefone\(u\.phone/.test(tela), null)
  }

  // ── 6. Nenhuma outra tela guarda só os dígitos ────────────────────────────
  //
  // É teste porque, sem ele, o próximo campo de telefone nasce com o mesmo
  // defeito e nada acusa.
  {
    const telas = [
      '_components/admin/users-manager.tsx',
      '_components/admin/crm-users-manager.tsx',
      '_components/admin/adicionar-membro-dialog.tsx',
      '_components/inbox/cadastrar-contato-dialog.tsx',
      '(auth)/auth/sign-up/page.tsx',
    ]
    const ruins = []
    for (const t of telas) {
      const texto = semComentarios(t)
      if (texto.includes('soDigitosTelefone(e.target.value)')) ruins.push(t)
    }
    ok('nenhuma-tela-guarda-so-os-digitos-no-onChange', ruins.length === 0, ruins)
  }

  fim()
})()
