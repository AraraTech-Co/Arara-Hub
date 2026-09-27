# SPED Validator — Design Document
**Arara Tech · Portal de Suporte**
**Data:** 2026-05-29 | **Status:** Aprovado

---

## 1. Contexto e Problema

A Arara Tech gera arquivos SPED Fiscal (EFD ICMS/IPI) via automação Python/JS para clientes como Mazetto e Super Shopping. Os arquivos têm 9 bugs confirmados que causam rejeição no PVA (validador da Receita Federal). Não existe validação automática antes de entregar o arquivo ao contador, e o portal de suporte não tem ferramenta para validar um SPED sem abrir o PVA.

**Entregável desta sprint:** pacote Python `sped_validator` + serviço FastAPI + feature `/validador-sped` no portal Next.js.

**Fora de escopo desta sprint:** `sped_gerador.py` (CLI de automação com correção dos 9 bugs) — sprint separado posterior.

---

## 2. Decisões de Arquitetura

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Repositório | `leololato/sped-validator` (GitHub pessoal → transferir para araratech quando validado) | sped_validator tem 2 consumidores independentes (portal + futuro CLI); Python não pertence em repo Next.js |
| Serviço | FastAPI em `:8001` no mesmo VPS (YOUR_DEPLOY_HOST) | Reutiliza infra Docker Compose existente; sem custo extra; rede interna, não exposta |
| Autenticação | API Key via header `X-API-Key` | Server-to-server; sem múltiplos clientes externos |
| Banco histórico | Schema `sped_validacoes` no PostgreSQL existente do portal | Zero infra adicional |
| Encoding | Tenta latin1 primeiro, fallback utf-8 | SPEDs reais em campo frequentemente são latin1 |
| Escopo de validação | Todos os 10 blocos (0, B, C, D, E, G, H, K, 1, 9) conforme leiaute v019 | Spec completo desde o início |
| Limite de upload | 50 MB | Cobre SPEDs atuais |

---

## 3. Arquitetura Geral

```
GitHub: leololato/sped-validator
         │
         ├── sped_validator/        # pacote core — puro Python, sem deps externas
         ├── api/                   # FastAPI :8001
         ├── automacao/             # CLI sped_gerador.py (Sprint futura)
         └── tests/                 # fixtures: sped_valido.txt + sped_invalido.txt

VPS YOUR_DEPLOY_HOST — docker-compose existente
         │
         ├── portal-suporte (Next.js :3000)  ← já existe
         ├── postgres                         ← já existe
         └── sped-validator (FastAPI :8001)   ← novo, rede interna apenas
```

**Fluxo de dados:**
```
[Browser] → upload .txt → [Portal Next.js]
                                │
                    POST /validate (X-API-Key)
                                │
                         [FastAPI :8001]
                                │
                    sped_validator.validate_bytes()
                                │
                    persiste em sped_validacoes.validacoes
                                │
                    retorna ValidationResult (JSON)
                                │
                         [Portal Next.js]
                                │
                    renderiza view suporte ou cliente
```

---

## 4. Pacote `sped_validator`

### Estrutura de arquivos

```
sped_validator/
├── __init__.py          # exporta SpedValidator, ValidationResult, ValidationError
├── models.py            # dataclasses completos
├── parser.py            # etapa 1: leitura, split por |, normalização LF, latin1→utf-8
├── engine.py            # SpedValidator — orquestra as 5 etapas
└── validators/
    ├── base.py          # BlocoValidator: classe base com helpers comuns
    ├── bloco_0.py       # 0000 (15 campos), 0001, 0005, 0150, 0190, 0200 (13 campos)
    ├── bloco_b.py
    ├── bloco_c.py
    ├── bloco_d.py
    ├── bloco_e.py
    ├── bloco_g.py
    ├── bloco_h.py       # H001, H005, H010 (refs 0200/0190, VL_ITEM = QTD × VL_UNIT)
    ├── bloco_k.py       # K001, K100 (datas DDMMAAAA), K200 (5 campos), refs cruzadas
    ├── bloco_1.py
    └── bloco_9.py       # 9999.QTD_LIN = total linhas arquivo
```

### Modelos de dados

```python
@dataclass
class ValidationError:
    severity: str        # "CRITICAL" | "ERROR" | "WARNING" | "INFO"
    category: str        # "estrutura" | "leiaute" | "cruzamento" | "fechamento" | "negocio"
    bloco: str
    registro: str
    linha: int
    campo: str | None
    code: str            # ex: "K200_SEM_0200", "QTD_CAMPOS"
    mensagem: str
    sugestao: str
    technical: str       # ex: "Linha 512: K200, campo COD_ITEM = 'AA400' — não existe no 0200"
    raw: str
    valor_encontrado: str | None
    valor_esperado: str | None

@dataclass
class QuickCheck:
    label: str
    status: str          # "ok" | "fail" | "na"
    detail: str | None

@dataclass
class ValidationResult:
    id: str              # UUID
    file_name: str
    cnpj: str
    periodo: str         # "MM/AAAA"
    cod_ver: str
    blocos: dict[str, BlocoResult]
    errors: list[ValidationError]
    quick_checks: list[QuickCheck]
    schema_confidence: list[SchemaInfo]
    recommendations: list[Recommendation]
    summary: dict        # total_linhas, total_criticos, total_erros, total_avisos, status
    created_at: datetime
```

### Pipeline de validação (5 etapas)

1. **PARSE** — tenta latin1, fallback utf-8. Remove `\r`. Valida pipe inicial/final. Extrai REG. Verifica contra `VALID_REGISTERS`.
2. **ESTRUTURA** — sequência obrigatória por bloco. Abertura/fechamento X001/X990. Detecta registros inexistentes (ex: `0140` não existe em EFD ICMS/IPI).
3. **CAMPOS** — conta campos por registro vs layout v019. Valida tipos: datas DDMMAAAA, CNPJs, numéricos, domínios (`IND_EST` ∈ {0..5}).
4. **REFERÊNCIAS CRUZADAS** — produtos em K200/H010 devem existir em 0200. Unidades em H010 devem existir em 0190. Datas dentro do período do 0000. VL_ITEM em H010 = QTD × VL_UNIT (tolerância R$ 0,02).
5. **FECHAMENTO** — K990/H990/9999 QTD_LIN corretos. COD_VER = "019". IND_PERFIL ∈ {"A","B"}. Gera QuickChecks, SchemaInfo e Recommendations.

### Layouts críticos (v019)

| Registro | Campos | Detalhe |
|----------|--------|---------|
| 0000 | 15 | COD_VER obrigatoriamente `"019"` |
| 0001 | 2 | Registro próprio — nunca embutido no 0000 |
| 0200 | 13 | Campo 13 = CEST (pode ser vazio, deve existir) |
| K100 | 3 | Datas em DDMMAAAA (8 dígitos) |
| K200 | 5 | `REG\|DT_EST\|COD_ITEM\|QTD_EST\|IND_EST` — sem VL_UNIT |

### Interface pública

```python
from sped_validator import SpedValidator

v = SpedValidator()
result = v.validate_bytes(b"...", filename="sped.txt")  # FastAPI
result = v.validate_string("...")                        # futuro CLI
result = v.validate_file("/path/sped.txt")              # testes
```

### Fixtures de teste

- `tests/fixtures/sped_valido.txt` — `MAZETTO BLOCO K 12.2025 - CORRETO - TRANSMITIDO.txt` (gabarito; deve passar com 0 erros críticos)
- `tests/fixtures/sped_invalido.txt` — `sped.txt` do zip (deve detectar os 9 bugs)

---

## 5. FastAPI Service

### Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/health` | Nenhuma | Liveness probe |
| `POST` | `/validate` | API Key | Valida arquivo, persiste, retorna ValidationResult |
| `GET` | `/history` | API Key | Lista paginada (`?cnpj=&limit=20&offset=0`) |
| `GET` | `/history/{id}` | API Key | Resultado completo por UUID |

### Persistência

```sql
CREATE SCHEMA IF NOT EXISTS sped_validacoes;

CREATE TABLE sped_validacoes.validacoes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj         VARCHAR(14) NOT NULL,
  periodo      VARCHAR(7)  NOT NULL,
  cod_ver      VARCHAR(10),
  status       VARCHAR(20) NOT NULL,  -- 'APROVADO' | 'REPROVADO' | 'COM_AVISOS'
  total_erros  INT NOT NULL DEFAULT 0,
  total_avisos INT NOT NULL DEFAULT 0,
  resultado    JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON sped_validacoes.validacoes (cnpj);
CREATE INDEX ON sped_validacoes.validacoes (created_at DESC);
```

### Docker Compose (adição ao VPS)

```yaml
sped-validator:
  image: ${ECR_REGISTRY}/sped-validator:latest
  restart: unless-stopped
  environment:
    API_KEY: ${SPED_VALIDATOR_KEY}
    DATABASE_URL: ${DATABASE_URL}
  depends_on: [database]
  networks: [portal-network]
  # Sem "ports:" — apenas acessível via http://sped-validator:8001
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
    interval: 30s
    timeout: 5s
    retries: 3
```

### Variáveis de ambiente

**Serviço FastAPI:** `API_KEY`, `DATABASE_URL`

**Portal Next.js** (adicionar a `.env` e GitHub Secrets):
- `SPED_VALIDATOR_URL=http://sped-validator:8001`
- `SPED_VALIDATOR_KEY=<uuid4 gerado>`

---

## 6. Portal `/validador-sped`

### Rotas

```
/validador-sped             → upload + resultado
/validador-sped/historico   → lista paginada
/validador-sped/[id]        → resultado completo por ID
```

**RBAC:** `admin`, `agent`, `manager`, `supervisor` → view suporte | `client` → view cliente.

### Aba Upload

- Drag & drop ou clique — `.txt`, 50 MB máximo
- Barra de progresso em 5 etapas animadas (Parse → Estrutura → Campos → Referências → Fechamento)
- Polling via Server Action — sem WebSocket

### View Suporte

- Header: badge STATUS + CNPJ + período + nº linhas + nome do arquivo
- **Quick Checks:** 8 cards pass/fail (Cabeçalho, Bloco K, Fechamento K990, Fechamento 9999, Itens sem 0200, Unidades 0190, Bloco H, COD_VER=019)
- **Cards de blocos:** 10 cards coloridos (verde/amarelo/vermelho/cinza) — Blocos 0, B, C, D, E, G, H, K, 1, 9
- **Tabela de erros:** filtrável por severidade, categoria, bloco. Colunas: Sev. | Cat. | Registro | Linha | Campo | Problema | Correção Técnica
- **Recomendações:** colapsável por registro — estrutura oficial, passos técnicos derivados dos erros reais
- **Exports:** CSV Detalhado (1 linha por erro) + CSV Resumo

### View Cliente

- 3 cards: erros críticos · avisos · blocos com problema
- Mensagens em linguagem simples (sem jargão técnico)
- Botão "Abrir chamado para correção" — pré-preenche ticket com ID da validação + resumo

### Aba Histórico

- Tabela paginada: CNPJ | Empresa | Período | Status | Erros | Avisos | Data | Ver →
- Filtros: busca por CNPJ/empresa, período, status
- Role `client`: filtra apenas pelo CNPJ da empresa vinculada ao perfil

### Server Action

```typescript
// app/validador-sped/actions.ts
'use server'
export async function validarSped(formData: FormData) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const res = await fetch(`${process.env.SPED_VALIDATOR_URL}/validate`, {
    method: 'POST',
    headers: { 'X-API-Key': process.env.SPED_VALIDATOR_KEY! },
    body: formData,
  })
  return res.json()
}
```

### Sidebar

Entrada no grupo **Clientes** de `admin-sidebar.tsx`:
```typescript
{ href: '/validador-sped', label: 'Validador SPED', icon: FileCheck }
```

---

## 7. Ordem de Implementação

### Sprint 1 — Pacote core (repositório `leololato/sped-validator`)
1. `sped_validator/models.py` — dataclasses
2. `sped_validator/parser.py` — parse + normalização
3. `sped_validator/validators/bloco_0.py` — 0000, 0001, 0200
4. `sped_validator/validators/bloco_k.py` — K100, K200, refs cruzadas
5. `sped_validator/validators/bloco_h.py` — H005, H010
6. `sped_validator/validators/bloco_9.py` — 9999 fechamento
7. `sped_validator/engine.py` — orquestração dos 5 passos
8. `tests/test_engine.py` — testes com sped_valido.txt e sped_invalido.txt

### Sprint 2 — FastAPI + Deploy
9. `api/main.py` — setup FastAPI, middleware API Key
10. `api/routes.py` — POST /validate, GET /history, GET /health
11. `api/db.py` — asyncpg, schema sped_validacoes, persistência
12. `Dockerfile` + `requirements.txt`
13. GitHub Actions CI/CD para o novo repo
14. Adição do serviço ao docker-compose do VPS

### Sprint 3 — Portal Next.js
15. `app/validador-sped/page.tsx` — rota + tabs
16. Componente de upload (drag & drop, 50MB, .txt)
17. `app/validador-sped/actions.ts` — Server Action
18. View suporte — Quick Checks + cards blocos + tabela erros + recomendações
19. View cliente — cards resumo + mensagens simples + botão chamado
20. Aba histórico — tabela paginada com filtros
21. `app/validador-sped/[id]/page.tsx` — resultado por ID
22. Sidebar: adicionar entrada Validador SPED no grupo Clientes

---

## 8. Referências

- `SPED_VALIDATOR_SPEC.md` — spec técnico detalhado (v1.1)
- `automacaoblock-main.zip` — scripts de automação existentes com os 9 bugs
- `MAZETTO BLOCO K 12.2025 - CORRETO - TRANSMITIDO.txt` — arquivo de referência (gabarito)
- Guia Prático EFD ICMS/IPI v019 — leiaute oficial
