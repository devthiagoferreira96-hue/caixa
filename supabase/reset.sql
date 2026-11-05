-- =====================================================================
-- APAGA TODOS OS DADOS do Caixa da Família no Supabase.
-- Use só se precisar recomeçar do zero (por exemplo, para trocar para esta
-- versão do banco). Depois rode o schema.sql de novo.
-- =====================================================================
drop view if exists saldo_contas;
drop table if exists parcelas, compras_cartao, lancamentos, pessoas, categorias,
  cartoes, contas, tentativas_convite, membros, familias cascade;
drop function if exists criar_familia(text), entrar_familia(text), eh_membro(uuid),
  gerar_codigo_convite(), conferir_mesma_familia() cascade;
