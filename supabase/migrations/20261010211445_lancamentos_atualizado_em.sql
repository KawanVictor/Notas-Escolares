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
