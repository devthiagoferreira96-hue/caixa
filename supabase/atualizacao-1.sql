-- =====================================================================
-- Atualização do banco (QA de 04/11/2026)
-- Só rode este arquivo se você JÁ tinha rodado uma versão anterior do schema.sql.
-- Em um projeto novo, rode apenas o schema.sql (ele já tem tudo isto).
-- =====================================================================

-- 1) Limite de valores em R$
alter table lancamentos drop constraint if exists lancamentos_valor_check;
alter table lancamentos add constraint lancamentos_valor_check check (valor > 0 and valor <= 99999999.99);
alter table compras_cartao drop constraint if exists compras_cartao_valor_total_check;
alter table compras_cartao add constraint compras_cartao_valor_total_check check (valor_total > 0 and valor_total <= 99999999.99);
alter table contas drop constraint if exists contas_saldo_inicial_check;
alter table contas add constraint contas_saldo_inicial_check check (saldo_inicial between -99999999.99 and 99999999.99);

-- 2) Código de convite mais difícil de adivinhar + limite de tentativas
create or replace function gerar_codigo_convite() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;
alter table familias alter column codigo_convite set default gerar_codigo_convite();
update familias set codigo_convite = gerar_codigo_convite();  -- gera códigos novos

create table if not exists tentativas_convite (user_id uuid not null, em timestamptz not null default now());
alter table tentativas_convite enable row level security;

create or replace function entrar_familia(p_codigo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  if (select count(*) from tentativas_convite
      where user_id = auth.uid() and em > now() - interval '1 hour') >= 5 then
    raise exception 'Muitas tentativas de codigo. Espere uma hora e tente de novo.';
  end if;
  select id into f from familias where codigo_convite = upper(trim(p_codigo));
  if f is null then
    insert into tentativas_convite (user_id) values (auth.uid());
    return null;
  end if;
  insert into membros (familia_id, user_id) values (f, auth.uid()) on conflict do nothing;
  return f;
end $$;

-- 3) Excluir um cartão não apaga mais os pagamentos de fatura já feitos
alter table lancamentos drop constraint if exists lancamentos_fatura_cartao_id_fkey;
alter table lancamentos add constraint lancamentos_fatura_cartao_id_fkey
  foreign key (fatura_cartao_id) references cartoes(id) on delete set null;

-- 4) Um lançamento só pode usar conta/categoria/pessoa/cartão da própria família
create or replace function conferir_mesma_familia() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ref record;
  existe boolean;
begin
  for ref in
    select * from (values
      ('contas', to_jsonb(new) ->> 'conta_id'),
      ('categorias', to_jsonb(new) ->> 'categoria_id'),
      ('pessoas', to_jsonb(new) ->> 'pessoa_id'),
      ('cartoes', coalesce(to_jsonb(new) ->> 'cartao_id', to_jsonb(new) ->> 'fatura_cartao_id')),
      ('compras_cartao', to_jsonb(new) ->> 'compra_id')
    ) as r(tabela, id) where r.id is not null
  loop
    execute format('select exists (select 1 from %I where id = $1 and familia_id = $2)', ref.tabela)
      into existe using ref.id::bigint, new.familia_id;
    if not existe then
      raise exception 'Item de outra família (%)', ref.tabela;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists mesma_familia on lancamentos;
drop trigger if exists mesma_familia on compras_cartao;
drop trigger if exists mesma_familia on parcelas;
create trigger mesma_familia before insert or update on lancamentos for each row execute function conferir_mesma_familia();
create trigger mesma_familia before insert or update on compras_cartao for each row execute function conferir_mesma_familia();
create trigger mesma_familia before insert or update on parcelas for each row execute function conferir_mesma_familia();

-- 5) Só quem fez login pode chamar as funções
revoke execute on function criar_familia(text), entrar_familia(text), eh_membro(uuid),
  gerar_codigo_convite(), conferir_mesma_familia() from public, anon;
grant execute on function criar_familia(text), entrar_familia(text), eh_membro(uuid) to authenticated;
