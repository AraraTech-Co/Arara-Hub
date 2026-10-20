-- Índices para as leituras por `conversation_id` em `model_records`.
--
-- APLICAR À MÃO (não é migração do Prisma): `CREATE INDEX CONCURRENTLY` não roda dentro de
-- transação, e uma migração comum travaria as ESCRITAS da tabela durante a construção.
-- Fora do horário de pico. Um comando de cada vez, no `psql`, sem `BEGIN`.
--
-- POR QUÊ
--   A camada de modelos (src/lib/models.ts) lê `findMany({ conversation_id: X })` em SQL de
--   duas formas. Nenhuma tem índice, então cada leitura filtrada percorre TODAS as linhas
--   do modelo (`WhatsAppMessage` é o maior, e as linhas carregam o anexo em base64, que
--   precisa ser descomprimido do TOAST só para olhar o `conversation_id`).
--     1. com `mascararCampos` (rotas da lista e da conversa aberta do portal-suporte):
--          WHERE app_id = $ AND model_name = $ AND data->>'conversation_id' = $
--          ORDER BY created_at DESC LIMIT .. OFFSET ..
--     2. sem `mascararCampos` (as demais leituras por campo, via Prisma):
--          WHERE app_id = $ AND model_name = $ AND (data #> ARRAY['conversation_id']::text[])::jsonb = $
--          ORDER BY created_at DESC LIMIT .. OFFSET ..
--   Um índice de expressão por forma, com `created_at DESC` no fim para atender o ORDER BY.
--
-- MEDIDO (laboratório, Postgres 16, 300 mil mensagens, 2 mil com anexo de ~300 KB, tabela com
-- 692 MB, leitura pela própria camada, parâmetros reais do Prisma, 6 a 8 execuções seguidas):
--     forma 1:  310 a 383 ms  ->  1 a 10 ms
--     forma 2:  314 a 453 ms  ->  1 a 10 ms
--   Tamanho de cada índice no laboratório: ~20 a 23 MB (cresce com o número de linhas).
--   Em produção as leituras filtradas medidas no navegador foram: ~5,2 s para a conversa aberta
--   e ~12 a 14 s para a lista (até 40 leituras por conversa em sequência).
--   Limite conhecido: com `plan_cache_mode = force_generic_plan` o planner não usa o índice de
--   expressão (a chave chega como parâmetro). Nas execuções normais do Prisma ele usou.
--
-- ANTES: confirme o espaço em disco (a construção lê a tabela inteira, inclusive o TOAST).
-- Acompanhe com:  SELECT * FROM pg_stat_progress_create_index;
-- Depois: ANALYZE model_records;  e conferir o plano com EXPLAIN (ANALYZE) das duas formas.

-- Forma 1 (leituras com `mascararCampos`)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_records_conversation_id_texto
  ON model_records (app_id, model_name, (data->>'conversation_id'), created_at DESC);

-- Forma 2 (leituras sem `mascararCampos`)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_records_conversation_id_jsonb
  ON model_records (app_id, model_name, ((data #> ARRAY['conversation_id']::text[])::jsonb), created_at DESC);

-- Se algum índice ficar INVALID (construção interrompida): DROP INDEX CONCURRENTLY e recriar.
-- ROLLBACK (sem efeito sobre os dados):
--   DROP INDEX CONCURRENTLY IF EXISTS idx_model_records_conversation_id_texto;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_model_records_conversation_id_jsonb;
