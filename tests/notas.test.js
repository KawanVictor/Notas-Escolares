import assert from "node:assert/strict";
import test from "node:test";

import * as notas from "../public/js/notas.js";

function alunoCom(nome, valores = {}) {
  const aluno = notas.novoAluno();

  aluno.nome = nome;
  Object.assign(aluno.notas, valores);

  return aluno;
}

test("interpreta vírgula, ponto e digitação incompleta", () => {
  assert.equal(notas.interpretarNota("4,5"), 4.5);
  assert.equal(notas.interpretarNota("4.5"), 4.5);
  assert.equal(notas.interpretarNota("4,"), 4);
  assert.equal(notas.interpretarNota("0"), 0);
  assert.equal(notas.interpretarNota(4.5), 4.5);
});

test("vazio e inválido não viram nota", () => {
  for (const texto of ["", "  ", null, undefined, "abc", ",", "NaN", "Infinity"]) {
    assert.equal(notas.interpretarNota(texto), null, String(texto));
  }
});

test("limita entre zero e a nota máxima", () => {
  assert.equal(notas.interpretarNota("45"), 6);
  assert.equal(notas.interpretarNota("-1"), 0);
});

test("normaliza para vírgula sem zeros sobrando", () => {
  assert.equal(notas.normalizarNota("4.50"), "4,5");
  assert.equal(notas.normalizarNota("6,0"), "6");
  assert.equal(notas.normalizarNota("0"), "0");
  assert.equal(notas.normalizarNota("3.25"), "3,25");
  assert.equal(notas.normalizarNota(""), "");
});

test("aceita a nota pela metade durante a digitação", () => {
  for (const texto of ["", "4", "4,", "4,5", "4.25", ",5"]) {
    assert.ok(notas.NOTA_EM_DIGITACAO.test(texto), texto);
  }

  for (const texto of ["a", "4,,", "4,555", "123", "-1", "4 "]) {
    assert.ok(!notas.NOTA_EM_DIGITACAO.test(texto), texto);
  }
});

test("médias com tudo preenchido", () => {
  const valores = { integrada1: "6", integrada2: "6" };

  for (const chave of Object.keys(notas.ATIVIDADES_PRINCIPAIS)) {
    valores[chave] = "4";
  }

  const medias = notas.calcularMedias(valores);

  assert.equal(medias.media_total, 4);
  assert.equal(medias.media_integrada, 6);
  assert.equal(medias.media_final_integrada, 5);
  // 75% da média total + 25% da média integrada.
  assert.equal(medias.media_trimestral, 4.5);
});

test("campos vazios não contam como zero", () => {
  const medias = notas.calcularMedias({ oralidade: "6", leitura: "" });

  assert.equal(medias.media_total, 6);
  assert.equal(medias.media_integrada, null);
  assert.equal(medias.media_final_integrada, 6);
  assert.equal(medias.media_trimestral, 6);
});

test("nota zero entra na média", () => {
  assert.equal(notas.calcularMedias({ oralidade: "0", leitura: "6" }).media_total, 3);
});

test("sem notas não há médias", () => {
  assert.ok(Object.values(notas.calcularMedias({})).every((valor) => valor === null));
});

test("faixas", () => {
  assert.equal(notas.faixa(4.5), "boa");
  assert.equal(notas.faixa(4.49), "intermediaria");
  assert.equal(notas.faixa(3), "intermediaria");
  assert.equal(notas.faixa(2.99), "baixa");
  assert.equal(notas.faixa(0), "baixa");
  assert.equal(notas.faixa(null), "");
});

test("datas usam o dia local", () => {
  // 9 de outubro às 23h30 no horário local: em UTC-3 já seria dia 10 pelo horário universal.
  assert.equal(notas.dataDeHoje(new Date(2026, 9, 9, 23, 30)), "2026-10-09");
  assert.equal(notas.formatarData("2026-10-09"), "09/10/2026");
  assert.equal(notas.formatarData(""), "");
  assert.equal(notas.formatarData(null), "");
});

test("CSV usa vírgula decimal em notas e médias", () => {
  const alunos = [alunoCom("Silva; Ana", { oralidade: "4.5", leitura: "0" })];
  const linhas = notas.gerarCsv({ turma: "7º A", data: "2026-10-09" }, alunos).split("\r\n");
  const totalCampos = Object.keys(notas.CAMPOS_CABECALHO).length;

  assert.equal(linhas[1], "Turma;7º A");
  assert.equal(linhas[totalCampos - 1], "Data;09/10/2026");
  assert.equal(linhas[totalCampos], "");
  assert.equal(linhas[totalCampos + 1], notas.titulosDasColunas().join(";"));

  const linhaAluno = linhas.at(-1);

  assert.ok(linhaAluno.startsWith('1;"Silva; Ana";4,5;0;'), linhaAluno);
  // Depois das aspas, o nome com ponto e vírgula conta como um campo só.
  assert.equal(linhaAluno.replace('"Silva; Ana"', "nome").split(";").length, notas.titulosDasColunas().length);
  assert.equal(linhaAluno.replace('"Silva; Ana"', "nome").split(";")[10], "2,25");
});

test("CSV escapa aspas", () => {
  const csv = notas.gerarCsv({}, [alunoCom('Ana "Nina"')]);

  assert.ok(csv.includes('"Ana ""Nina"""'));
});
