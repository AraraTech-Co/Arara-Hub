# Pedido ao Hefler — `hub.arara-tech.com` com HTTPS

**Data:** 27/08/2026 · **De:** Leonardo
**Depende de:** nada — o app já existe e já está publicado

---

## O que já está feito

O app **`arara-hub`** foi criado na plataforma e o front já está publicado nele:

```
http://YOUR_DEPLOY_HOST:10009/     → 200, o Hub responde
/h/arara-hub/                → mesmo lugar, pelo proxy
```

## O que falta

**`hub.arara-tech.com` apontando para esse hosting, com certificado** — do mesmo jeito
que `suporte.arara-tech.com` e `crm.arara-tech.com` já funcionam (nginx com TLS na
frente).

## Por que o HTTPS é o ponto, e não um detalhe

O Hub é uma **tela de login**: é nele que a equipe vai digitar a senha da plataforma, a
mesma que abre todos os sistemas Arara.

Hoje o hosting do app responde só em `http://YOUR_DEPLOY_HOST:10009/` — **sem TLS**. Numa página
sem certificado, a senha trafega em claro e a página pode ser adulterada no caminho (quem
estiver na rede injeta um formulário que envia a senha para outro lugar, e nada na tela
denuncia).

Por isso o Hub está temporariamente servido em **`https://suporte.arara-tech.com/hub/`**,
que já está atrás do seu nginx com certificado. Funciona, mas é endereço emprestado: o Hub
é a porta de entrada da Arara e deveria ter o próprio nome.

## Resumindo

| | |
|---|---|
| **App** | `arara-hub` (criado, hosting ativo na porta 10009) |
| **Preciso** | `hub.arara-tech.com` → esse hosting, **com certificado** |
| **Enquanto isso** | o Hub roda em `https://suporte.arara-tech.com/hub/` |
| **Quando existir** | o caminho `/hub/` do portal sai, e o Hub passa a viver só no app dele |

Se por algum motivo o subdomínio for demorar, me diga — não é bloqueio, o Hub continua
funcionando pelo endereço emprestado.
