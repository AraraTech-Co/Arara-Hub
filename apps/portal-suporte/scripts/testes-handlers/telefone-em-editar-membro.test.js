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
const fs = require('node:fs')
const path = require('node:path')
const { ok, fim } = require('./_carregar.js')
const { registrarTS, importarTela, semComentarios, APP } = require('./_tela.js')

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

  // ── 0. A LIGAÇÃO do campo, executada ──────────────────────────────────────
  //
  // Os casos abaixo executam a máscara, e os do bloco 5 leem o texto do
  // `onChange`. Nenhum dos dois pega uma ligação que CHAMA a máscara certa e
  // depois estraga o resultado — por exemplo
  // `setEditPhone(mascaraTelefone(e.target.value).replace(/\D/g, ''))`, que
  // tem "mascaraTelefone", não tem "soDigitosTelefone", e volta a acumular 55.
  //
  // Então este bloco RECORTA do `users-manager.tsx` as expressões reais do
  // `value=` e do `onChange=` do campo, compila as duas, e roda o laço que o
  // navegador roda: mostrar → a pessoa digita no fim → onChange → novo estado.
  // Se a ligação estragar o valor, o laço acumula e o caso reprova.
  {
    const fonte = fs.readFileSync(path.join(APP, '_components/admin/users-manager.tsx'), 'utf8')

    // Âncora ESTÁVEL: o placeholder do campo. Ancorar em `value={editPhone}`
    // seria procurar pela expressão que está sob teste — qualquer mudança nela
    // viraria "não achei o campo" em vez de reprovar o comportamento.
    const ANCORA = 'placeholder="(19) 99999-9999"'
    const at = fonte.indexOf(ANCORA)
    const abre = fonte.lastIndexOf('<Input', at)
    const fecha = fonte.indexOf('/>', at)
    ok('achou-o-elemento-do-telefone',
      at > 0 && abre > 0 && fecha > at && fonte.split(ANCORA).length - 1 === 1,
      { at, abre, fecha, ocorrencias: fonte.split(ANCORA).length - 1 })
    const elemento = fonte.slice(abre, fecha)

    const mValue = elemento.match(/value=\{([^}]*)\}/)
    const mChange = elemento.match(/onChange=\{(\(e\)\s*=>\s*[\s\S]*?)\}\s*$/m)
    ok('recortou-o-value-e-o-onChange', !!mValue && !!mChange,
      { value: mValue && mValue[1], onChange: mChange && mChange[1] })

    const exprValue = (mValue || [])[1] || ''
    const exprChange = (mChange || [])[1] || ''

    // As duas expressões compiladas com as MESMAS funções que a tela importa.
    // Compilar e executar com as funções que a tela importa. Se a ligação usar
    // outra coisa, o `new Function` lança — e aqui isso é FALHA NOMEADA, não
    // morte do arquivo: um mutante que mata a bateria por exceção não diz qual
    // regra quebrou.
    let mostrar = null, aoDigitar = null, erroDeCompilar = ''
    try {
      mostrar = new Function('editPhone', 'mascaraTelefone', 'soDigitosTelefone',
        'return (' + exprValue + ')')
      aoDigitar = new Function('setEditPhone', 'mascaraTelefone', 'soDigitosTelefone',
        'return (' + exprChange + ')')
      // Uma volta seca, só para ver se as duas rodam com o que a tela importa.
      const sonda = aoDigitar(() => {}, U.mascaraTelefone, U.soDigitosTelefone)
      sonda({ target: { value: '1' } })
      mostrar('', U.mascaraTelefone, U.soDigitosTelefone)
    } catch (e) {
      erroDeCompilar = String((e && e.message) || e)
    }
    ok('ligacao: as-expressoes-do-campo-executam', erroDeCompilar === '', erroDeCompilar)
    if (erroDeCompilar) { fim(); return }

    function campo(inicial) {
      let estado = inicial
      const set = (v) => { estado = v }
      const onChange = aoDigitar(set, U.mascaraTelefone, U.soDigitosTelefone)
      return {
        mostrado: () => mostrar(estado, U.mascaraTelefone, U.soDigitosTelefone),
        digitar(teclas) {
          for (const tecla of teclas) {
            onChange({ target: { value: this.mostrado() + tecla } })
          }
          return this.mostrado()
        },
        colar(texto) {
          onChange({ target: { value: texto } })
          return this.mostrado()
        },
        apagarUm() {
          onChange({ target: { value: this.mostrado().slice(0, -1) } })
          return this.mostrado()
        },
        estado: () => estado,
      }
    }

    // Digitar tecla a tecla, no campo de verdade.
    {
      const c = campo('')
      const fim_ = c.digitar('11987654321')
      ok('ligacao: digitar-tecla-a-tecla', fim_ === ESPERADO, fim_)
      ok('ligacao: sem-55-a-mais-no-fim', !fim_.includes('(55)'), fim_)
    }
    // Cada passo intermediário: é onde o defeito aparecia na 2ª tecla.
    {
      const c = campo('')
      const passos = []
      for (const tecla of '11987654321') {
        c.digitar(tecla)
        passos.push(c.mostrado())
      }
      ok('ligacao: nenhum-passo-ganha-um-55', passos.filter((x) => x.includes('(55)')).length === 0,
        passos)
      ok('ligacao: o-campo-nao-congela', new Set(passos).size === passos.length, passos)
    }
    // Colar, com e sem DDI.
    {
      ok('ligacao: colar-o-numero', campo('').colar('11987654321') === ESPERADO)
      ok('ligacao: colar-com-ddi', campo('').colar('5511987654321') === ESPERADO)
      ok('ligacao: colar-do-whatsapp', campo('').colar('+55 11 98765-4321') === ESPERADO)
    }
    // Apagar e corrigir no meio.
    {
      const c = campo('')
      c.digitar('11987654321')
      c.apagarUm()
      const corrigido = c.digitar('9')
      ok('ligacao: apagar-o-ultimo-e-digitar', corrigido === '+55 (11) 98765-4329', corrigido)
      const d = campo('')
      d.digitar('11987654321')
      for (let i = 0; i < 20; i++) d.apagarUm()
      ok('ligacao: apagar-tudo-esvazia', d.mostrado() === '', d.mostrado())
    }
    // O que vai ao servidor sai do ESTADO, não do que está na tela.
    {
      const c = campo('')
      c.digitar('11987654321')
      const digitos = String(c.estado()).replace(/\D/g, '')
      ok('ligacao: o-estado-rende-13-digitos', digitos === '5511987654321', digitos)
    }
    // E o carregamento do membro: o primeiro render não pode mostrar cru.
    {
      const mLoad = fonte.match(/setEditPhone\(([^\n]*u\.phone[^\n]*)\)\s*$/m)
      ok('recortou-o-carregamento', !!mLoad, mLoad && mLoad[1])
      const carregar = new Function('u', 'mascaraTelefone', 'soDigitosTelefone',
        'return (' + ((mLoad || [])[1] || 'u.phone') + ')')
      const vindo = carregar({ phone: '5511987654321' }, U.mascaraTelefone, U.soDigitosTelefone)
      ok('ligacao: membro-salvo-entra-formatado',
        mostrar(vindo, U.mascaraTelefone, U.soDigitosTelefone) === ESPERADO,
        { vindo, mostrado: mostrar(vindo, U.mascaraTelefone, U.soDigitosTelefone) })
      // E digitar DEPOIS de carregar continua certo.
      const c = campo(vindo)
      c.apagarUm()
      ok('ligacao: editar-depois-de-carregar', c.digitar('9') === '+55 (11) 98765-4329', c.mostrado())
    }
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
