-- Lançamento de notas: uma planilha por turma, disciplina e trimestre, com os seus alunos.
-- Cada usuário só enxerga e altera os próprios lançamentos (RLS).

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users (id) on delete cascade,
  escola text not null default '' check (char_length(escola) <= 200),
  turma text not null default '' check (char_length(turma) <= 200),
  ano_serie text not null default '' check (char_length(ano_serie) <= 200),
  disciplina text not null default '' check (char_length(disciplina) <= 200),
  trimestre text not null default '' check (char_length(trimestre) <= 200),
  professor text not null default '' check (char_length(professor) <= 200),
  data date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index lancamentos_dono_idx on public.lancamentos (dono, atualizado_em desc);

create table public.alunos (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos (id) on delete cascade,
  posicao integer not null,
  nome text not null default '' check (char_length(nome) <= 200),
  oralidade numeric(3, 2) check (oralidade between 0 and 6),
  leitura numeric(3, 2) check (leitura between 0 and 6),
  producao_textual numeric(3, 2) check (producao_textual between 0 and 6),
  gramatica numeric(3, 2) check (gramatica between 0 and 6),
  ortografia numeric(3, 2) check (ortografia between 0 and 6),
  participacao numeric(3, 2) check (participacao between 0 and 6),
  atividade1 numeric(3, 2) check (atividade1 between 0 and 6),
  atividade2 numeric(3, 2) check (atividade2 between 0 and 6),
  integrada1 numeric(3, 2) check (integrada1 between 0 and 6),
  integrada2 numeric(3, 2) check (integrada2 between 0 and 6)
);

create index alunos_lancamento_idx on public.alunos (lancamento_id, posicao);

alter table public.lancamentos enable row level security;
alter table public.alunos enable row level security;

-- Só usuários autenticados acessam as tabelas; quem não entrou não acessa nada.
revoke all on public.lancamentos, public.alunos from anon;
grant select, insert, update, delete on public.lancamentos, public.alunos to authenticated;

create policy "Dono vê os próprios lançamentos" on public.lancamentos
  for select to authenticated
  using ((select auth.uid()) = dono);

create policy "Dono cria os próprios lançamentos" on public.lancamentos
  for insert to authenticated
  with check ((select auth.uid()) = dono);

create policy "Dono altera os próprios lançamentos" on public.lancamentos
  for update to authenticated
  using ((select auth.uid()) = dono)
  with check ((select auth.uid()) = dono);

create policy "Dono exclui os próprios lançamentos" on public.lancamentos
  for delete to authenticated
  using ((select auth.uid()) = dono);

-- Os alunos seguem o dono do lançamento a que pertencem.
create policy "Dono vê os alunos dos seus lançamentos" on public.alunos
  for select to authenticated
  using (exists (
    select 1 from public.lancamentos l
    where l.id = lancamento_id and l.dono = (select auth.uid())
  ));

create policy "Dono inclui alunos nos seus lançamentos" on public.alunos
  for insert to authenticated
  with check (exists (
    select 1 from public.lancamentos l
    where l.id = lancamento_id and l.dono = (select auth.uid())
  ));

create policy "Dono altera os alunos dos seus lançamentos" on public.alunos
  for update to authenticated
  using (exists (
    select 1 from public.lancamentos l
    where l.id = lancamento_id and l.dono = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.lancamentos l
    where l.id = lancamento_id and l.dono = (select auth.uid())
  ));

create policy "Dono exclui os alunos dos seus lançamentos" on public.alunos
  for delete to authenticated
  using (exists (
    select 1 from public.lancamentos l
    where l.id = lancamento_id and l.dono = (select auth.uid())
  ));

-- Mantém a data da última alteração sem depender do relógio de quem está usando o site.
create function public.marcar_atualizacao()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger lancamentos_marcar_atualizacao
  before update on public.lancamentos
  for each row execute function public.marcar_atualizacao();
