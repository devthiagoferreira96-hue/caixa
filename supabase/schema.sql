-- =====================================================================
-- Caixa da Família — banco de dados (Supabase / PostgreSQL)
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run
-- Pode rodar uma vez só. As contas, cartões e categorias padrão são
-- criados automaticamente quando a primeira pessoa cria a família no app.
-- =====================================================================

-- ---------- Código de convite: 6 caracteres sem os que confundem (0/O, 1/I)
-- 32^6 = mais de 1 bilhão de combinações
create or replace function gerar_codigo_convite() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

-- ---------- Família e membros (você e sua esposa veem os mesmos dados)
create table familias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo_convite text not null unique default gerar_codigo_convite(),
  criado_em timestamptz default now()
);

create table membros (
  familia_id uuid references familias(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (familia_id, user_id)
);

-- "Este usuário faz parte da família?" — usado pelas regras de segurança
create or replace function eh_membro(f uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from membros where familia_id = f and user_id = auth.uid());
$$;

-- ---------- Cadastros
create table contas (                -- Espécie, MMP, Nubank, TMP, M.C.
  id bigint generated always as identity primary key,
  familia_id uuid not null references familias(id) on delete cascade,
  nome text not null,
  saldo_inicial numeric(12,2) not null default 0    -- saldo que já existia antes de usar o sistema
    check (saldo_inicial between -99999999.99 and 99999999.99),
  ativa boolean not null default true
);

create table cartoes (               -- Mercado Pago, Nubank, Thays
  id bigint generated always as identity primary key,
  familia_id uuid not null references familias(id) on delete cascade,
  nome text not null,
  dia_fechamento int not null check (dia_fechamento between 1 and 31),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  ativo boolean not null default true
);

create table categorias (
  id bigint generated always as identity primary key,
  familia_id uuid not null references familias(id) on delete cascade,
  nome text not null,
  grupo text not null default 'Casa',          -- Casa, Fazenda, Empresa, Financeiro, Serviços...
  no_grafico boolean not null default true     -- aparece no gráfico do Início?
);

create table pessoas (               -- família, funcionários, prestadores
  id bigint generated always as identity primary key,
  familia_id uuid not null references familias(id) on delete cascade,
  nome text not null,
  tipo text not null default 'Outro'           -- Família, Funcionário, Prestador, Outro
);

-- ---------- Movimentação do caixa (colunas A:K da planilha)
create table lancamentos (
  id bigint generated always as identity primary key,
  familia_id uuid not null references familias(id) on delete cascade,
  tipo text not null check (tipo in ('saida','entrada')),
  valor numeric(12,2) not null check (valor > 0 and valor <= 99999999.99),  -- até R$ 99.999.999,99
  descricao text not null,
  vencimento date not null,
  pago boolean not null default false,          -- STATUS "OK"
  data_pagamento date,
  conta_id bigint references contas(id),
  categoria_id bigint references categorias(id),
  pessoa_id bigint references pessoas(id) on delete set null,
  parcela text,                                 -- ex.: "3/12" em contas repetidas
  grupo uuid,                                   -- liga lançamentos repetidos entre si
  fatura_cartao_id bigint references cartoes(id) on delete set null, -- é pagamento de fatura?
  fatura_mes date,
  criado_por uuid default auth.uid(),
  criado_em timestamptz default now()
);

-- ---------- Compras no cartão (colunas Q:AP da planilha)
create table compras_cartao (
  id bigint generated always as identity primary key,
  familia_id uuid not null references familias(id) on delete cascade,
  cartao_id bigint not null references cartoes(id) on delete cascade,
  data_compra date not null,
  valor_total numeric(12,2) not null check (valor_total > 0 and valor_total <= 99999999.99),
  qtd_parcelas int not null default 1 check (qtd_parcelas between 1 and 48),
  descricao text not null,
  categoria_id bigint references categorias(id),
  subcategoria text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz default now()
);

create table parcelas (              -- criadas pelo app a partir da compra
  id bigint generated always as identity primary key,
  compra_id bigint not null references compras_cartao(id) on delete cascade,
  familia_id uuid not null references familias(id) on delete cascade,
  numero int not null,
  valor numeric(12,2) not null,
  fatura_mes date not null           -- 1º dia do mês em que a fatura vence
);

-- Tentativas de usar código de convite (limita quem tenta adivinhar códigos)
create table tentativas_convite (
  user_id uuid not null,
  em timestamptz not null default now()
);
alter table tentativas_convite enable row level security; -- sem políticas: só as funções acessam

create index on lancamentos (familia_id, vencimento);
create index on lancamentos (familia_id, fatura_mes);
create index on lancamentos (grupo);
create index on parcelas (familia_id, fatura_mes);

-- ---------- Segurança (RLS): cada pessoa só enxerga os dados da própria família
do $$
declare t text;
begin
  foreach t in array array['contas','cartoes','categorias','pessoas',
                           'lancamentos','compras_cartao','parcelas'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "somente a familia" on %I for all to authenticated
         using (eh_membro(familia_id)) with check (eh_membro(familia_id))', t);
  end loop;
end $$;

alter table familias enable row level security;
create policy "ver a propria familia" on familias for select to authenticated using (eh_membro(id));
create policy "renomear a propria familia" on familias for update to authenticated using (eh_membro(id));

alter table membros enable row level security;
create policy "ver o proprio vinculo" on membros for select to authenticated using (user_id = auth.uid());

-- ---------- Integridade: um lançamento/compra só pode apontar para conta, categoria,
-- pessoa, cartão ou compra da MESMA família
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

create trigger mesma_familia before insert or update on lancamentos
  for each row execute function conferir_mesma_familia();
create trigger mesma_familia before insert or update on compras_cartao
  for each row execute function conferir_mesma_familia();
create trigger mesma_familia before insert or update on parcelas
  for each row execute function conferir_mesma_familia();

-- ---------- Saldo de cada conta (substitui o bloco SUMIFS "ESPÉCIE / MMP / ...")
create view saldo_contas with (security_invoker = on) as
select c.id as conta_id,
       c.saldo_inicial + coalesce(sum(case when l.tipo = 'entrada' then l.valor else -l.valor end), 0) as saldo
from contas c
left join lancamentos l on l.conta_id = c.id and l.pago
group by c.id, c.saldo_inicial;

-- ---------- Criar a família (1ª pessoa) já com contas, cartões e categorias da planilha
create or replace function criar_familia(p_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Você já faz parte de uma família';
  end if;

  insert into familias (nome) values (coalesce(nullif(trim(p_nome), ''), 'Nossa família')) returning id into f;
  insert into membros (familia_id, user_id) values (f, auth.uid());

  insert into contas (familia_id, nome)
  select f, unnest(array['Espécie','MMP','Nubank','TMP','M.C.']);

  -- Ajuste os dias de fechamento/vencimento depois, na tela Ajustes do app
  insert into cartoes (familia_id, nome, dia_fechamento, dia_vencimento) values
    (f, 'Mercado Pago', 3, 10), (f, 'Nubank', 1, 8), (f, 'Cartão Thays', 5, 12);

  insert into categorias (familia_id, nome, grupo, no_grafico)
  select f, x.nome, x.grupo, x.no_grafico from (values
    ('Cuidados Estéticos','Casa',true), ('Jogos','Casa',true), ('Roupas','Casa',true),
    ('Compras Pessoais','Casa',true), ('Lazer','Casa',true), ('Pet Despesas','Casa',true),
    ('Presentes/Doações','Casa',true), ('Ensino','Casa',true), ('Saúde/Farmácia','Casa',true),
    ('Despesas Fixas Casa','Casa',true), ('Alimentação/Produtos Limpeza','Casa',true),
    ('Restaurantes/Padarias','Casa',true), ('Veículo','Casa',true), ('Cigarro/Vap''s','Casa',true),
    ('Despesas Fazenda','Fazenda',false), ('Insumos Fazenda','Fazenda',false), ('Cargas','Fazenda',false),
    ('Despesas Empresas','Empresa',false), ('Jurídico','Empresa',false),
    ('Venda','Financeiro',false), ('Rendimentos Bancários','Financeiro',false),
    ('Empréstimos Bancários','Financeiro',false), ('Empréstimos Dívidas','Financeiro',false),
    ('Tarifas Bancárias','Financeiro',false), ('Ajuste Caixa','Financeiro',false),
    ('Assinatura Canais','Serviços',false), ('Segurança','Serviços',false), ('Telefone','Serviços',false)
  ) as x(nome, grupo, no_grafico);

  return f;
end $$;

-- ---------- Entrar numa família que já existe (2ª pessoa), usando o código de convite
-- Retorna o id da família, ou null se o código não existir (o app mostra a mensagem).
-- Não usa "raise" no código errado para que a tentativa fique registrada.
create or replace function entrar_familia(p_codigo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  -- no máximo 5 tentativas erradas por hora para cada pessoa
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

-- Só quem fez login pode chamar as funções (no Supabase elas nascem liberadas para todos)
revoke execute on function criar_familia(text), entrar_familia(text), eh_membro(uuid),
  gerar_codigo_convite(), conferir_mesma_familia() from public, anon;
grant execute on function criar_familia(text), entrar_familia(text), eh_membro(uuid) to authenticated;
