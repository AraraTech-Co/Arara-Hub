# Produção (servidor remoto)

Este diretório deve ser copiado para o servidor em `/home/<REMOTE_USER>/remote`. O workflow de deploy faz SSH nessa pasta, faz login no registry (AWS ECR ou outro), puxa a imagem e sobe com `docker compose`.

Os limites de CPU/memória em `core.yml` usam `deploy.resources`. O Docker Compose recente aplica isso em `docker compose up`; em versões antigas que ignorem `deploy`, use `docker compose --compatibility up` (ou atualize o pacote `docker-compose-plugin`) para que os limites entrem em vigor.

## Isolamento de stacks no mesmo VPS

Projeto Compose: **`remote`** (`name: remote` + `-p remote`). Rede: **`remote_portal`**.
Outros apps (ex. CRM) **não** podem usar o mesmo project name nem recriar o serviço `app` deste stack — senão um deploy mata o outro.

## No servidor

- Coloque aqui os arquivos `base.yml` e `core.yml`.
- A rede Docker é **`remote_portal`** para outros stacks anexarem ao mesmo Postgres.
- As variáveis de ambiente são injetadas pelo GitHub Actions no deploy. Para rodar manualmente, exporte as mesmas vars (DB_*, NEXT_PUBLIC_*, etc.) e execute:

```bash
cd /home/<user>/remote
export DOCKER_IMAGE=<registry>/<repo>   # ex: 123456789.dkr.ecr.us-east-1.amazonaws.com/portal-suporte
export IMAGE_TAG=latest                 # ou o sha do commit
# ... demais variáveis ...
docker compose -p remote -f base.yml -f core.yml up -d
```

## Variáveis no GitHub

Configure no repositório (Settings > Environments > americana ou staging) as **vars** e **secrets** usadas no deploy, incluindo `DOCKER_IMAGE`, `DOCKER_REGISTRY`, `DOCKER_LOGIN`, `MACHINE_IP`, `REMOTE_USER`, `DB_*`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, etc.
