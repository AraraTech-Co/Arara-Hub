# Auth unificado Arara — multi-app

Staff e apps compartilham usuários da platform (`User` SQL). Mapas de IDs legados e e-mails canônicos ficam **fora do Git**:

| Arquivo local (gitignore) | Uso |
|---------------------------|-----|
| `data/canonical-emails.json` | aliases → e-mail canônico |
| `data/user-id-map.json` | legacyId → platform user id |
| `data/*-credentials.json` / `*-api-key.txt` | chaves de app geradas na integração |

Gere esses arquivos com os scripts de integração (`unify-users.ts`, `integrate-app.ts`, etc.) a partir do seu ambiente — nunca commite dumps de produção nem senhas.

## Login (dev)

```bash
# emails/senhas = SEED_* em packages/api/.env
curl -sS -X POST http://localhost:4100/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SEED_ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}"
```

Depois mint key do app: `POST /v1/apps/:slug/keys` com Bearer JWT.
