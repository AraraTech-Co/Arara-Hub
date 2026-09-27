/**
 * Árvore de diagnóstico do "Assistente de Suporte".
 *
 * Portado verbatim do bundle da Doc de Apoio (public/doc-apoio/index.html), onde
 * vivia como um `const flowData` inline. Conteúdo escrito pela equipe de suporte —
 * ao editar, preserve o tom e os scripts prontos para o cliente.
 *
 * 29 passos, 78 opções, 22 botões de copiar-script.
 */

export type FlowOption =
  | { text: string; next: string }
  | { text: string; action: 'copyMessage'; message: string }

export type FlowStep = {
  title: string
  description?: string
  /** Destaque no topo do passo. */
  message?: string
  explanation?: string
  /** Perguntas de triagem para o atendente. */
  questions?: string[]
  solutions?: string[]
  /** Passo a passo numerado. */
  steps?: string[]
  causes?: string[]
  /** Texto pronto para enviar ao cliente. */
  script?: string
  options: FlowOption[]
}

/** Passo de entrada do fluxo. */
export const FLOW_ENTRY_STEP = 'initial'

export const supportFlow: Record<string, FlowStep> = {
    initial: {
        title: "🔍 Diagnóstico Inicial",
        description: "Olá! Sou o assistente de suporte. Vamos identificar seu problema rapidamente.",
        options: [
            { text: "🧾 Nota Fiscal", next: "notaFiscal" },
            { text: "💰 Caixa PDV", next: "caixa" },
            { text: "💳 TEF/Pagamento", next: "tef" },
            { text: "🖨️ Impressora", next: "impressora" },
            { text: "📱 Leitor Código", next: "leitor" },
            { text: "🌐 Internet/Servidor", next: "conexao" },
            { text: "📋 Outro Problema", next: "outro" }
        ]
    },
    notaFiscal: {
        title: "🧾 Problemas com Nota Fiscal",
        description: "Selecione o tipo de problema com nota fiscal:",
        options: [
            { text: "❌ Não emite nota", next: "naoEmite" },
            { text: "⚠️ Nota em contingência", next: "contingencia" },
            { text: "🔄 Não transmite", next: "naoTransmite" },
            { text: "📄 Erro XML/Schema", next: "erroXML" },
            { text: "🔢 Inutilizar nota", next: "inutilizar" },
            { text: "⬅️ Voltar", next: "initial" }
        ]
    },
    naoEmite: {
        title: "❌ Nota Fiscal Não Emite",
        message: "Vamos verificar por que a nota não está sendo emitida 👍",
        questions: [
            "A internet está funcionando?",
            "A SEFAZ está online?",
            "O certificado digital é válido?",
            "Aparece algum erro específico?"
        ],
        solutions: [
            "Verificar conexão com internet",
            "Testar status da SEFAZ",
            "Validar certificado digital",
            "Usar contingência se necessário"
        ],
        script: "Script para cliente: 'Vamos identificar o motivo da não emissão 👍 Primeiro, vamos verificar se a internet está funcionando. Depois, validamos o certificado digital e o status da SEFAZ. Se for instabilidade, podemos usar contingência.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Vamos verificar sua emissão de nota fiscal. Por favor, confirme: 1) Internet está funcionando? 2) Certificado digital válido? 3) Aparece algum erro? Assim que confirmar, te oriento na solução. 👍" },
            { text: "⬅️ Voltar", next: "notaFiscal" }
        ]
    },
    contingencia: {
        title: "⚠️ Nota em Contingência",
        message: "Essas notas foram emitidas em contingência por falta de comunicação com a SEFAZ 👍",
        explanation: "Elas ainda não foram autorizadas, mas estão salvas no sistema.",
        solutions: [
            "Fiscal > Notas pendentes > Reenviar",
            "Verificar conexão internet",
            "Verificar status SEFAZ",
            "Validar certificado digital"
        ],
        script: "Script para cliente: 'Essas notas foram emitidas em contingência, geralmente por falta de comunicação com a SEFAZ 👍 Vamos reenviar: Fiscal > Notas pendentes > Reenviar. Importante: Não apague essas notas!'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Suas notas estão em contingência (🟡). Isso acontece quando a SEFAZ está instável. Solução: Vá em Fiscal > Notas pendentes > Reenviar. Não apague as notas! Se precisar de ajuda, me chame. 👍" },
            { text: "⬅️ Voltar", next: "notaFiscal" }
        ]
    },
    naoTransmite: {
        title: "🔄 Nota Fiscal Não Transmite",
        message: "Vamos identificar o motivo da não transmissão 👍",
        questions: [
            "Aparece algum código de erro?",
            "Outras notas estão transmitindo?",
            "A internet está funcionando?",
            "O certificado está válido?"
        ],
        solutions: [
            "Verificar código de erro específico",
            "Testar conectividade com SEFAZ",
            "Validar certificado digital",
            "Usar modo contingência"
        ],
        script: "Script para cliente: 'Vamos identificar o motivo da não transmissão 👍 Primeiro, preciso saber se aparece algum código de erro. Depois, verificamos internet e certificado. Se for erro 403, pode ser SEFAZ ou certificado.'",
        options: [
            { text: "🚨 Erro 403 Forbidden", next: "erro403" },
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Vamos verificar sua transmissão de nota fiscal. Por favor, informe: 1) Aparece algum código de erro? 2) Internet está funcionando? 3) Outras notas transmitem? Assim que confirmar, te ajudo a resolver. 👍" },
            { text: "⬅️ Voltar", next: "notaFiscal" }
        ]
    },
    erro403: {
        title: "🚨 Transport Error 403 Forbidden",
        message: "Erro 403 Forbidden - Web Service bloqueado 👍",
        explanation: "Este erro ocorre principalmente por duas razões: SEFAZ fora do ar ou certificado digital vencido/atrasado.",
        causes: [
            "SEFAZ temporariamente indisponível",
            "Certificado digital vencido ou próximo do vencimento",
            "Configurações de proxy/firewall bloqueando",
            "URL do web service incorreta"
        ],
        steps: [
            "Acesse SGC > Gerenciamento > Parâmetros > NFe > Configurações da NFe",
            "Verifique a data de validade do certificado digital",
            "Teste o status da SEFAZ no portal oficial",
            "Verifique configurações de rede/proxy"
        ],
        solutions: [
            "SEFAZ fora → Aguardar normalização ou usar contingência",
            "Certificado vencido → Renovar imediatamente",
            "Proxy bloqueando → Ajustar configurações de rede",
            "URL incorreta → Corrigir endereço do web service"
        ],
        script: "Script para cliente: 'Erro 403 Forbidden geralmente é SEFAZ fora do ar ou certificado vencido 👍 Para verificar: Acesse SGC > Gerenciamento > Parâmetros > NFe > Configurações da NFe. Lá você vê a validade do certificado. Se for SEFAZ, aguardamos ou usamos contingência. Se for certificado, precisa renovar.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Seu erro 403 Forbidden acontece por: 1) SEFAZ fora do ar, ou 2) Certificado digital vencido. Para verificar: Acesse SGC > Gerenciamento > Parâmetros > NFe > Configurações da NFe. Confirme a data do certificado. Se for vencido, precisa renovar. Se for SEFAZ, aguardamos normalização. 👍" },
            { text: "⬅️ Voltar", next: "naoTransmite" }
        ]
    },
    erroXML: {
        title: "📄 Erro XML/Schema",
        message: "Esse erro indica que a estrutura da nota fiscal está inválida 👍",
        explanation: "Erro 215: Falha no Schema XML - XML não está no padrão SEFAZ",
        causes: [
            "Campos obrigatórios faltando (NCM, CFOP)",
            "Formato inválido (datas, números)",
            "Estrutura incorreta (tags)",
            "Versão desatualizada"
        ],
        solutions: [
            "Identificar campo com erro nos logs",
            "Corrigir cadastro (produto NCM/CFOP)",
            "Validar XML antes de enviar",
            "Atualizar sistema se necessário"
        ],
        script: "Script para cliente: 'Esse erro é de estrutura do XML  Vamos corrigir os dados e reenviar. Geralmente é NCM ou CFOP faltando no produto. Já verifico isso para você.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Erro de XML/Schema (código 215). Isso significa que algum dado da nota está inválido. Geralmente é NCM ou CFOP do produto. Já estou verificando seus cadastros para corrigir. " },
            { text: "⬅️ Voltar", next: "notaFiscal" }
        ]
    },
    inutilizar: {
        title: "🔢 Inutilizar Numeração",
        message: "Vamos inutilizar essa numeração para regularizar com a SEFAZ 👍",
        explanation: "Isso é obrigatório quando uma nota não é utilizada",
        steps: [
            "Acesse Fiscal > Inutilização de NFC-e",
            "Preencha: Série, Número inicial, Número final",
            "Justificativa (mínimo 15 caracteres)",
            "Clique em transmitir"
        ],
        script: "Script para cliente: 'Vamos inutilizar essa numeração para regularizar com a SEFAZ 👍 Isso é obrigatório quando uma nota não é utilizada. Te guio passo a passo.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Para inutilizar nota fiscal: 1) Fiscal > Inutilização de NFC-e 2) Preencher série e números 3) Justificativa (mínimo 15 caracteres) 4) Transmitir. Se precisar, te auxilio no processo. 👍" },
            { text: "⬅️ Voltar", next: "notaFiscal" }
        ]
    },
    caixa: {
        title: "💰 Problemas com Caixa PDV",
        description: "Selecione o tipo de problema com o caixa:",
        options: [
            { text: "🔓 Caixa não abre", next: "naoAbre" },
            { text: "🔒 Caixa não fecha", next: "naoFecha" },
            { text: "🔄 Não sincroniza", next: "naoSincroniza" },
            { text: "🖨️ Não imprime", next: "naoImprime" },
            { text: "⬅️ Voltar", next: "initial" }
        ]
    },
    naoAbre: {
        title: "🔓 Caixa Não Abre",
        message: "Vamos verificar por que o caixa não está abrindo 👍",
        questions: [
            "Já existe um caixa aberto?",
            "O sistema foi reiniciado?",
            "Aparece alguma mensagem de erro?"
        ],
        solutions: [
            "Verificar se já existe caixa aberto",
            "Reiniciar o sistema",
            "Tentar abrir novamente em Caixa > Abrir Caixa"
        ],
        script: "Script para cliente: 'Vamos verificar por que o caixa não está abrindo 👍 Primeiro, verificamos se já existe um caixa aberto. Depois, reiniciamos o sistema e tentamos novamente.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Seu caixa não está abrindo. Vamos verificar: 1) Já existe um caixa aberto? 2) Sistema foi reiniciado? 3) Aparece algum erro? Me avise o resultado para te orientar na solução. 👍" },
            { text: "⬅️ Voltar", next: "caixa" }
        ]
    },
    naoFecha: {
        title: "🔒 Caixa Não Fecha",
        message: "Isso geralmente acontece por venda pendente 👍",
        explanation: "Vendas sem finalização podem impedir o fechamento",
        solutions: [
            "Verificar vendas pendentes",
            "Finalizar ou cancelar vendas",
            "Verificar TEF não confirmado",
            "Tentar fechamento forçado com auditoria"
        ],
        script: "Script para cliente: 'Isso geralmente acontece por venda pendente 👍 Vamos verificar se existe alguma venda não finalizada ou TEF pendente.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Caixa não fechando? Geralmente é venda pendente. Verifico se existe alguma venda não finalizada ou TEF pendente. Em 2 minutos resolvemos isso. 👍" },
            { text: "⬅️ Voltar", next: "caixa" }
        ]
    },
    naoSincroniza: {
        title: "🔄 Caixa Não Sincroniza",
        message: "Vamos forçar a sincronização manual 👍",
        steps: [
            "Menu > Sincronização > Forçar sincronização",
            "Verificar conexão internet",
            "Validar conexão com servidor",
            "Reiniciar serviço de sync se necessário"
        ],
        script: "Script para cliente: 'Vamos forçar a sincronização manual 👍 Menu > Sincronização > Forçar sincronização. Se não funcionar, verificamos a conexão.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Seu caixa não sincronizando. Vamos forçar: Menu > Sincronização > Forçar sincronização. Se não resolver, verifico sua conexão com servidor. Pode ser um atraso normal. 👍" },
            { text: "⬅️ Voltar", next: "caixa" }
        ]
    },
    naoImprime: {
        title: "🖨️ Caixa Não Imprime",
        message: "Vamos verificar a impressora rapidinho 👍",
        questions: [
            "A impressora está ligada?",
            "Tem papel?",
            "Está conectada no computador?"
        ],
        solutions: [
            "Verificar cabo USB/rede",
            "Reiniciar impressora",
            "Imprimir página de teste do Windows",
            "Reinstalar driver se necessário"
        ],
        script: "Script para cliente: 'Vamos verificar a impressora rapidinho 👍 Verificamos energia, papel, conexão, e tentamos uma impressão teste.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Impressora não funcionando? Vamos verificar: 1) Está ligada e com papel? 2) Cabo conectado? 3) Teste impressão do Windows? Me avise os resultados para te ajudar. 👍" },
            { text: "⬅️ Voltar", next: "caixa" }
        ]
    },
    tef: {
        title: "💳 Problemas TEF/Pagamento",
        description: "Selecione o tipo de problema com TEF:",
        options: [
            { text: "💳 Não lê cartão", next: "naoLeCartao" },
            { text: "⏱️ Timeout na transação", next: "timeout" },
            { text: "💰 Valor debitado mas venda não finaliza", next: "debitadoNaoFinaliza" },
            { text: "⬅️ Voltar", next: "initial" }
        ]
    },
    naoLeCartao: {
        title: "💳 TEF Não Lê Cartão",
        message: "Vamos verificar a máquina de cartão 👍",
        solutions: [
            "Reiniciar pinpad/máquina",
            "Verificar conexão (USB/rede)",
            "Testar com outro cartão",
            "Verificar configuração TEF"
        ],
        script: "Script para cliente: 'Vamos verificar a máquina de cartão 👍 Primeiro, reiniciamos o equipamento e verificamos a conexão.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! TEF não lendo cartão? Vamos verificar: 1) Reinicie a máquina de cartão 2) Verifique conexão USB/rede 3) Teste com outro cartão. Me avise se funcionou! 👍" },
            { text: "⬅️ Voltar", next: "tef" }
        ]
    },
    timeout: {
        title: "⏱️ Timeout TEF",
        message: "Transação demorando muito para responder 👍",
        causes: [
            "Conexão instável com pinpad",
            "Problema de rede",
            "Serviço TEF parado"
        ],
        solutions: [
            "Verificar conexão rede",
            "Reiniciar serviço TEF",
            "Testar comunicação com pinpad"
        ],
        script: "Script para cliente: 'A transação está demorando muito 👍 Vamos verificar a conexão e reiniciar o serviço TEF.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! TEF com timeout? Isso é demora na comunicação. Verifico sua conexão e reinicio o serviço TEF. Em geral, resolve em alguns minutos. 👍" },
            { text: "⬅️ Voltar", next: "tef" }
        ]
    },
    debitadoNaoFinaliza: {
        title: "💰 Valor Debitado mas Venda Não Finaliza",
        message: "O valor foi debitado no cartão? 👍",
        explanation: "Se sim, vamos só finalizar a venda no sistema",
        solutions: [
            "Confirmar débito no extrato",
            "Finalizar venda manualmente",
            "Verificar status da transação",
            "Reconciliar pagamento se necessário"
        ],
        script: "Script para cliente: 'O valor foi debitado no cartão? Se sim, vamos só finalizar a venda no sistema 👍 Não se preocupe, não vai cobrar novamente.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Valor debitado mas venda não finalizada? Não se preocupe! Se o valor foi debitado, só finalizo a venda no sistema. Não cobra novamente. Confirme o débito no extrato. 👍" },
            { text: "⬅️ Voltar", next: "tef" }
        ]
    },
    impressora: {
        title: "🖨️ Problemas com Impressora",
        description: "Selecione o tipo de problema:",
        options: [
            { text: "❌ Não liga", next: "impressoraNaoLiga" },
            { text: "📄 Não imprime", next: "impressoraNaoImprime" },
            { text: "📋 Erro de driver", next: "erroDriver" },
            { text: "⬅️ Voltar", next: "initial" }
        ]
    },
    impressoraNaoLiga: {
        title: "❌ Impressora Não Liga",
        message: "Vamos verificar a energia da impressora 👍",
        solutions: [
            "Verificar cabo de energia",
            "Testar outra tomada",
            "Verificar botão power",
            "Testar com outro cabo"
        ],
        script: "Script para cliente: 'Vamos verificar a energia da impressora 👍 Testamos tomada, cabo e botão de ligar.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Impressora não liga? Vamos verificar: 1) Cabo de energia conectado? 2) Tomada funcionando? 3) Botão power pressionado? Me avise os testes para te ajudar. 👍" },
            { text: "⬅️ Voltar", next: "impressora" }
        ]
    },
    impressoraNaoImprime: {
        title: "📄 Impressora Não Imprime",
        message: "Vamos verificar a impressora rapidinho 👍",
        solutions: [
            "Verificar cabo USB/rede",
            "Verificar papel e toner",
            "Imprimir página de teste",
            "Reinstalar driver"
        ],
        script: "Script para cliente: 'Vamos verificar a impressora rapidinho 👍 Cabo, papel, toner, e fazemos um teste.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Impressora não imprime? Verificamos: 1) Cabo conectado 2) Tem papel e toner 3) Teste impressão Windows. Se não funcionar, reinstalamos o driver. 👍" },
            { text: "⬅️ Voltar", next: "impressora" }
        ]
    },
    erroDriver: {
        title: "📋 Erro de Driver",
        message: "Problema com driver da impressora 👍",
        solutions: [
            "Baixar driver oficial",
            "Desinstalar driver atual",
            "Instalar novo driver",
            "Reiniciar computador"
        ],
        script: "Script para cliente: 'É problema de driver 👍 Vamos reinstalar o driver da impressora para resolver.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Erro de driver da impressora? Vamos reinstalar: 1) Desinstale driver atual 2) Baixe driver oficial 3) Instale novo driver 4) Reinicie PC. Te auxilio no processo. 👍" },
            { text: "⬅️ Voltar", next: "impressora" }
        ]
    },
    leitor: {
        title: "📱 Leitor de Código de Barras",
        description: "Selecione o tipo de problema:",
        options: [
            { text: "❌ Não liga", next: "leitorNaoLiga" },
            { text: "🔊 Não bipa", next: "leitorNaoBipa" },
            { text: "⬅️ Voltar", next: "initial" }
        ]
    },
    leitorNaoLiga: {
        title: "❌ Leitor Não Liga",
        message: "Vamos verificar o leitor de código 👍",
        solutions: [
            "Verificar cabo USB",
            "Testar outra porta USB",
            "Verificar alimentação (se tiver)",
            "Testar em outro computador"
        ],
        script: "Script para cliente: 'Vamos verificar o leitor de código 👍 Testamos USB, porta, e se funciona em outro PC.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Leitor não liga? Verificamos: 1) Cabo USB conectado 2) Testar outra porta USB 3) Testar em outro computador. Me avise os resultados! 👍" },
            { text: "⬅️ Voltar", next: "leitor" }
        ]
    },
    leitorNaoBipa: {
        title: "🔊 Leitor Não Bipa",
        message: "Vamos testar a leitura 👍",
        solutions: [
            "Testar no bloco de notas",
            "Verificar configuração",
            "Limpar sensor óptico",
            "Verificar tipo de código"
        ],
        script: "Script para cliente: 'Vamos testar a leitura 👍 Primeiro, testamos no bloco de notas para ver se o leitor está funcionando.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Leitor não bipa? Vamos testar: 1) Abra o bloco de notas 2) Tente ler um código 3) Se digitar números, leitor OK. Me avise o resultado! 👍" },
            { text: "⬅️ Voltar", next: "leitor" }
        ]
    },
    conexao: {
        title: "🌐 Internet/Servidor",
        description: "Selecione o tipo de problema:",
        options: [
            { text: "🐌 Servidor lento", next: "servidorLento" },
            { text: "🌐 Sem internet", next: "semInternet" },
            { text: "🔌 Queda de conexão", next: "quedaConexao" },
            { text: "⬅️ Voltar", next: "initial" }
        ]
    },
    servidorLento: {
        title: "🐌 Servidor Lento",
        message: "Vamos verificar se a lentidão é no sistema ou na conexão 👍",
        questions: [
            "Está lento em todos os computadores?",
            "A internet está normal?",
            "Só o PDV está lento?"
        ],
        solutions: [
            "Internet → Reiniciar roteador",
            "Servidor → Verificar CPU, banco",
            "Reiniciar sistema/servidor"
        ],
        script: "Script para cliente: 'Vamos verificar se a lentidão é no sistema ou na conexão 👍 Testamos em outros computadores e verificamos a rede.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Sistema lento? Verifico: 1) Está lento em todos os PCs? 2) Internet normal? 3) Só PDV lento? Dependendo do caso, reiniciamos servidor ou roteador. 👍" },
            { text: "⬅️ Voltar", next: "conexao" }
        ]
    },
    semInternet: {
        title: "🌐 Sem Internet",
        message: "Sem internet → Modo contingência automático 👍",
        explanation: "Pode continuar vendendo normalmente",
        solutions: [
            "Usar contingência automática",
            "Verificar roteador/modem",
            "Testar cabo de rede",
            "Contatar provedor se necessário"
        ],
        script: "Script para cliente: 'Sem internet 👍 Pode continuar vendendo normalmente, o sistema entra em contingência automático. As notas serão enviadas quando voltar.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Sem internet? Não se preocupe! Pode continuar vendendo normalmente 👍 Sistema usa contingência automática. Notas serão enviadas quando voltar a conexão. Reinicie o roteador se possível. 👍" },
            { text: "⬅️ Voltar", next: "conexao" }
        ]
    },
    quedaConexao: {
        title: "🔌 Queda de Conexão",
        message: "Conexão instável com servidor 👍",
        solutions: [
            "Verificar cabo de rede",
            "Testar WiFi vs cabo",
            "Reiniciar roteador",
            "Verificar configurações de rede"
        ],
        script: "Script para cliente: 'Conexão instável 👍 Vamos verificar cabo, roteador, e testar estabilidade da rede.'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Conexão caindo? Verifico: 1) Cabo de rede firme? 2) WiFi estável? 3) Roteador precisa reiniciar? Faço esses testes e ajustes para você. 👍" },
            { text: "⬅️ Voltar", next: "conexao" }
        ]
    },
    outro: {
        title: "📋 Outro Problema",
        message: "Descreva seu problema para te ajudar melhor 👍",
        explanation: "Se o problema não está listado, me dê mais detalhes",
        script: "Script para cliente: 'Pode me dar mais detalhes do problema? Assim te ajudo de forma mais precisa 👍'",
        options: [
            { text: "📋 Copiar Mensagem", action: "copyMessage", message: "Olá! Vi que precisa de ajuda com um problema específico. Por favor, me descreva com detalhes o que está acontecendo, quando começou, e se apareceu alguma mensagem de erro. Assim te ajudo melhor! 👍" },
            { text: "⬅️ Voltar", next: "initial" }
        ]
    }
}
