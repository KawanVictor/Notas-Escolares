import assert from "node:assert/strict";
import test from "node:test";

import * as dados from "../public/js/dados.js";
import { criarSupabaseFalso } from "./ajuda/supabase-falso.js";

const CABECALHO = {
  escola: "Escola Municipal",
  turma: "7º A",
  ano_serie: "7º ano",
  disciplina: "Português",
  trimestre: "1º",
  professor: "Marta",
  data: "2026-10-09"
};

function planilhaCom(...nomes) {
  const planilha = dados.novaPlanilha();

  planilha.alunos = nomes.map((nome) => ({ ...dados.criarAluno(), nome }));

  return planilha;
}

test("planilha nova começa com uma linha de aluno e sem id", () => {
  const planilha = dados.novaPlanilha();

  assert.equal(planilha.id, null);
  assert.equal(planilha.alunos.length, 1);
  assert.deepEqual(planilha.removidos, []);
});

test("primeira gravação cria o lançamento e os alunos, na ordem da tabela", async () => {
  const { supabase, banco } = criarSupabaseFalso();
  const planilha = planilhaCom("  Ana  ", "Bia");

  planilha.alunos[0].notas.oralidade = "4,5";
  planilha.alunos[0].notas.leitura = "45";
  planilha.alunos[1].notas.gramatica = "0";

  assert.equal(await dados.gravarPlanilha(supabase, planilha, CABECALHO), null);

  assert.deepEqual(banco.chamadas, ["lancamentos.insert", "alunos.upsert"]);
  assert.equal(banco.lancamentos.length, 1);
  assert.equal(banco.lancamentos[0].turma, "7º A");
  assert.equal(planilha.id, banco.lancamentos[0].id);

  const [ana, bia] = banco.alunos;

  assert.deepEqual([ana.nome, ana.posicao, ana.lancamento_id], ["Ana", 1, planilha.id]);
  // Notas vão como número: vírgula convertida, acima do máximo limitada, vazio como null.
  assert.deepEqual([ana.oralidade, ana.leitura, ana.gramatica], [4.5, 6, null]);
  assert.deepEqual([bia.nome, bia.posicao, bia.gramatica], ["Bia", 2, 0]);
});

test("data em branco é gravada como null", async () => {
  const { supabase, banco } = criarSupabaseFalso();

  await dados.gravarPlanilha(supabase, planilhaCom("Ana"), { ...CABECALHO, data: "" });

  assert.equal(banco.lancamentos[0].data, null);
});

test("regravar atualiza o mesmo lançamento e os mesmos alunos, sem duplicar", async () => {
  const { supabase, banco } = criarSupabaseFalso();
  const planilha = planilhaCom("Ana", "Bia");

  await dados.gravarPlanilha(supabase, planilha, CABECALHO);
  planilha.alunos[0].nome = "Ana Souza";
  planilha.alunos.reverse();
  banco.chamadas.length = 0;

  assert.equal(await dados.gravarPlanilha(supabase, planilha, { ...CABECALHO, turma: "7º B" }), null);

  assert.deepEqual(banco.chamadas, ["lancamentos.update", "alunos.upsert"]);
  assert.equal(banco.lancamentos.length, 1);
  assert.equal(banco.lancamentos[0].turma, "7º B");
  assert.equal(banco.alunos.length, 2);
  assert.deepEqual(
    banco.alunos.map((aluno) => [aluno.nome, aluno.posicao]).sort(),
    [["Ana Souza", 2], ["Bia", 1]]
  );
});

test("aluno removido só sai do banco na gravação seguinte", async () => {
  const { supabase, banco } = criarSupabaseFalso();
  const planilha = planilhaCom("Ana", "Bia", "Caio");

  await dados.gravarPlanilha(supabase, planilha, CABECALHO);
  dados.removerAluno(planilha, planilha.alunos[1]);

  assert.equal(banco.alunos.length, 3);
  assert.equal(planilha.removidos.length, 1);

  banco.chamadas.length = 0;
  assert.equal(await dados.gravarPlanilha(supabase, planilha, CABECALHO), null);

  assert.deepEqual(banco.chamadas, ["lancamentos.update", "alunos.upsert", "alunos.delete"]);
  assert.deepEqual(banco.alunos.map((aluno) => [aluno.nome, aluno.posicao]), [["Ana", 1], ["Caio", 2]]);
  assert.deepEqual(planilha.removidos, []);
});

test("falha ao criar o lançamento não grava nada e mantém a planilha sem id", async () => {
  const { supabase, banco } = criarSupabaseFalso();
  const planilha = planilhaCom("Ana");

  banco.falhas.add("lancamentos.insert");

  const erro = await dados.gravarPlanilha(supabase, planilha, CABECALHO);

  assert.match(erro.message, /falha simulada/);
  assert.equal(planilha.id, null);
  assert.equal(banco.lancamentos.length, 0);
  assert.equal(banco.alunos.length, 0);
});

test("falha ao gravar alunos: tentar de novo não cria outro lançamento", async () => {
  const { supabase, banco } = criarSupabaseFalso();
  const planilha = planilhaCom("Ana", "Bia");

  banco.falhas.add("alunos.upsert");
  assert.match((await dados.gravarPlanilha(supabase, planilha, CABECALHO)).message, /falha simulada/);
  assert.equal(banco.lancamentos.length, 1);
  assert.equal(banco.alunos.length, 0);
  assert.equal(planilha.alunos.length, 2);

  banco.falhas.clear();
  assert.equal(await dados.gravarPlanilha(supabase, planilha, CABECALHO), null);
  assert.equal(banco.lancamentos.length, 1);
  assert.equal(banco.alunos.length, 2);
});

test("falha ao remover alunos: a remoção fica pendente e sai na tentativa seguinte", async () => {
  const { supabase, banco } = criarSupabaseFalso();
  const planilha = planilhaCom("Ana", "Bia");

  await dados.gravarPlanilha(supabase, planilha, CABECALHO);
  dados.removerAluno(planilha, planilha.alunos[1]);
  banco.falhas.add("alunos.delete");

  assert.match((await dados.gravarPlanilha(supabase, planilha, CABECALHO)).message, /falha simulada/);
  assert.equal(banco.alunos.length, 2);
  assert.equal(planilha.removidos.length, 1);

  banco.falhas.clear();
  assert.equal(await dados.gravarPlanilha(supabase, planilha, CABECALHO), null);
  assert.deepEqual(banco.alunos.map((aluno) => aluno.nome), ["Ana"]);
  assert.deepEqual(planilha.removidos, []);
});

test("gravar um lançamento excluído em outro aparelho devolve erro e não recria nada", async () => {
  const { supabase, banco } = criarSupabaseFalso();
  const planilha = planilhaCom("Ana");

  await dados.gravarPlanilha(supabase, planilha, CABECALHO);
  await dados.excluirLancamento(supabase, planilha.id);

  const erro = await dados.gravarPlanilha(supabase, planilha, CABECALHO);

  assert.match(erro.message, /não existe mais/);
  assert.equal(banco.lancamentos.length, 0);
  assert.equal(banco.alunos.length, 0);
});

test("carregar devolve cabeçalho e alunos na ordem, com as notas formatadas", async () => {
  const { supabase } = criarSupabaseFalso();
  const planilha = planilhaCom("Ana", "Bia");

  planilha.alunos[0].notas.oralidade = "4.5";
  planilha.alunos[1].notas.integrada1 = "6";
  await dados.gravarPlanilha(supabase, planilha, CABECALHO);

  const lido = await dados.carregarLancamento(supabase, planilha.id);

  assert.equal(lido.erro, null);
  assert.deepEqual(lido.cabecalho, CABECALHO);
  assert.equal(lido.planilha.id, planilha.id);
  assert.deepEqual(lido.planilha.alunos.map((aluno) => aluno.nome), ["Ana", "Bia"]);
  assert.deepEqual(lido.planilha.alunos.map((aluno) => aluno.id), planilha.alunos.map((aluno) => aluno.id));
  assert.equal(lido.planilha.alunos[0].notas.oralidade, "4,5");
  assert.equal(lido.planilha.alunos[0].notas.leitura, "");
  assert.equal(lido.planilha.alunos[1].notas.integrada1, "6");
  assert.deepEqual(lido.planilha.removidos, []);
});

test("carregar um lançamento que não existe devolve planilha null, sem erro", async () => {
  const { supabase } = criarSupabaseFalso();

  assert.deepEqual(await dados.carregarLancamento(supabase, crypto.randomUUID()), {
    planilha: null,
    cabecalho: null,
    erro: null
  });
});

test("carregar repassa o erro do banco", async () => {
  const { supabase, banco } = criarSupabaseFalso();

  banco.falhas.add("lancamentos.select");

  const lido = await dados.carregarLancamento(supabase, crypto.randomUUID());

  assert.equal(lido.planilha, null);
  assert.match(lido.erro.message, /falha simulada/);
});

test("listar traz os lançamentos com a contagem de alunos", async () => {
  const { supabase } = criarSupabaseFalso();

  await dados.gravarPlanilha(supabase, planilhaCom("Ana", "Bia"), CABECALHO);
  await dados.gravarPlanilha(supabase, planilhaCom("Caio"), { ...CABECALHO, turma: "8º A" });

  const { lancamentos, erro } = await dados.listarLancamentos(supabase);

  assert.equal(erro, null);
  assert.deepEqual(
    lancamentos.map((lancamento) => [lancamento.turma, lancamento.alunos[0].count]).sort(),
    [["7º A", 2], ["8º A", 1]]
  );
});

test("listar com falha devolve lista vazia e o erro", async () => {
  const { supabase, banco } = criarSupabaseFalso();

  banco.falhas.add("lancamentos.select");

  const { lancamentos, erro } = await dados.listarLancamentos(supabase);

  assert.deepEqual(lancamentos, []);
  assert.match(erro.message, /falha simulada/);
});

test("excluir remove o lançamento e os seus alunos, sem tocar nos outros", async () => {
  const { supabase, banco } = criarSupabaseFalso();
  const primeira = planilhaCom("Ana", "Bia");
  const segunda = planilhaCom("Caio");

  await dados.gravarPlanilha(supabase, primeira, CABECALHO);
  await dados.gravarPlanilha(supabase, segunda, { ...CABECALHO, turma: "8º A" });

  assert.equal(await dados.excluirLancamento(supabase, primeira.id), null);
  assert.deepEqual(banco.lancamentos.map((lancamento) => lancamento.turma), ["8º A"]);
  assert.deepEqual(banco.alunos.map((aluno) => aluno.nome), ["Caio"]);
});

test("excluir com falha devolve o erro e não apaga nada", async () => {
  const { supabase, banco } = criarSupabaseFalso();
  const planilha = planilhaCom("Ana");

  await dados.gravarPlanilha(supabase, planilha, CABECALHO);
  banco.falhas.add("lancamentos.delete");

  assert.match((await dados.excluirLancamento(supabase, planilha.id)).message, /falha simulada/);
  assert.equal(banco.lancamentos.length, 1);
  assert.equal(banco.alunos.length, 1);
});
