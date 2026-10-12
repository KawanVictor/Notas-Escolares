-- Só usuários autenticados acessam as tabelas; quem não entrou não acessa nada.
revoke all on public.lancamentos, public.alunos from anon;
