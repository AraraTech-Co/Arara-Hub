-- Índice para a busca por `data.id` em `model_records`.
--
-- APLICAR À MÃO (não é migração do Prisma): `CREATE INDEX CONCURRENTLY` não roda dentro de
-- transação, e uma migração comum travaria as ESCRITAS da tabela durante a construção.
-- Fora do horário de pico. Um comando de cada vez, no `psql`, sem `BEGIN`.
--
-- POR QUÊ
--   `findById` e `update` da camada de modelos (src/lib/models.ts) procuram primeiro pela chave
--   da tabela e, se não acham, pelo `id` dentro do JSON. Registros com id próprio (ex.: as
--   mensagens do WhatsApp, `wam_…`) são sempre achados pela segunda forma. O SQL que o Prisma
--   gera para ela (capturado no log, Prisma 6.19.3):
--     WHERE app_id = $1 AND model_name = $2
--       AND (data #> ARRAY[$3]::text[])::jsonb::jsonb = $4      -- $3 = 'id'
--     LIMIT 1
--   O índice abaixo tem exatamente essa expressão. Vale para todo model de todo app.
--
-- MEDIDO (laboratório, Postgres 16, camada real, 60 mil mensagens, 3 mil com anexo de 300 KB,
-- tabela com 944 MB, 12 execuções seguidas de cada id):
--     id existente:      184 a 499 ms  ->  3 a 5 ms
--     id inexistente:    361 a 406 ms  ->  1 ms
--     EXPLAIN: 131 mil blocos lidos (Seq Scan)  ->  4 blocos (Index Scan)
--   Tamanho do índice no laboratório: 6,2 MB para 60 mil linhas (cresce com o número de linhas).
--   Limite conhecido: com `plan_cache_mode = force_generic_plan` o planner não usa o índice
--   (o nome do campo chega como parâmetro). Com o padrão `auto` ele usou nas 48 execuções.
--   Prova repetível: scripts/testes/indice-busca-por-id-real.test.mjs
--
-- ANTES: `SHOW plan_cache_mode;` (esperado `auto`) e espaço em disco (a construção lê a tabela
-- inteira, inclusive o TOAST). Acompanhe com:  SELECT * FROM pg_stat_progress_create_index;
-- DEPOIS: ANALYZE model_records;  e
--   SELECT indexrelid::regclass, indisvalid FROM pg_index
--    WHERE indexrelid = 'idx_model_records_data_id'::regclass;   -- esperado: t

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_records_data_id
  ON model_records (app_id, model_name, ((data #> ARRAY['id']::text[])::jsonb));

-- Se o índice ficar INVALID (construção interrompida): DROP INDEX CONCURRENTLY e recriar.
-- ROLLBACK (sem efeito sobre os dados):
--   DROP INDEX CONCURRENTLY IF EXISTS idx_model_records_data_id;
