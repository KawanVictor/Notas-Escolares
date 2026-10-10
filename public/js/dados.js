// Leitura e gravação dos lançamentos no Supabase.
// Não mexe na página: recebe o cliente do Supabase por parâmetro, o que permite testar com um banco simulado.

import * as notas from "./notas.js";

const CHAVES_ATIVIDADES = Object.keys(notas.TODAS_ATIVIDADES);

export const MAXIMO_DE_ALUNOS = 200;

export function criarAluno() {
  return { id: crypto.randomUUID(), ...notas.novoAluno() };
}

/** Planilha em edição. Sempre começa com pelo menos uma linha de aluno. */
export function novaPlanilha(id = null, alunos = []) {
  // "removidos" guarda os alunos já gravados que foram tirados da tabela e ainda precisam sair do banco.
  return { id, alunos: alunos.length > 0 ? alunos : [criarAluno()], removidos: [] };
}

export function removerAluno(planilha, aluno) {
  planilha.alunos = planilha.alunos.filter((item) => item !== aluno);
  planilha.removidos.push(aluno.id);
}

/** Lançamentos do usuário, do mais recente para o mais antigo, com a contagem de alunos. */
export async function listarLancamentos(supabase) {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, escola, turma, disciplina, trimestre, atualizado_em, alunos(count)")
    .order("atualizado_em", { ascending: false });

  return { lancamentos: data ?? [], erro: error };
}

/** Devolve { planilha, cabecalho }; planilha vem null se o lançamento não existir (ou não for do usuário). */
export async function carregarLancamento(supabase, id) {
  const { data, error } = await supabase.from("lancamentos").select("*, alunos(*)").eq("id", id).maybeSingle();

  if (error || !data) {
    return { planilha: null, cabecalho: null, erro: error };
  }

  const alunos = [...data.alunos]
    .sort((a, b) => a.posicao - b.posicao)
    .map((linha) => {
      const aluno = { id: linha.id, ...notas.novoAluno() };

      aluno.nome = linha.nome;

      for (const chave of CHAVES_ATIVIDADES) {
        aluno.notas[chave] = notas.normalizarNota(linha[chave]);
      }

      return aluno;
    });
  const cabecalho = {};

  for (const chave of Object.keys(notas.CAMPOS_CABECALHO)) {
    cabecalho[chave] = data[chave] ?? "";
  }

  return { planilha: novaPlanilha(data.id, alunos), cabecalho, erro: null };
}

/**
 * Grava cabeçalho, alunos e remoções, nessa ordem. Devolve o erro, se houver.
 * Se falhar no meio, nada do que está na planilha se perde: basta gravar de novo.
 */
export async function gravarPlanilha(supabase, planilha, cabecalho) {
  const dadosDaTurma = { ...cabecalho, data: cabecalho.data || null };

  if (planilha.id) {
    const { data, error } = await supabase.from("lancamentos").update(dadosDaTurma).eq("id", planilha.id).select("id");

    if (error) {
      return error;
    }

    if (data.length === 0) {
      return new Error("este lançamento não existe mais (pode ter sido excluído em outro aparelho).");
    }
  } else {
    const { data, error } = await supabase.from("lancamentos").insert(dadosDaTurma).select("id").single();

    if (error) {
      return error;
    }

    // Guardado já aqui para uma nova tentativa não criar outro lançamento.
    planilha.id = data.id;
  }

  const linhas = planilha.alunos.map((aluno, indice) => ({
    id: aluno.id,
    lancamento_id: planilha.id,
    posicao: indice + 1,
    nome: aluno.nome.trim(),
    ...Object.fromEntries(CHAVES_ATIVIDADES.map((chave) => [chave, notas.interpretarNota(aluno.notas[chave])]))
  }));

  if (linhas.length > 0) {
    const { error } = await supabase.from("alunos").upsert(linhas);

    if (error) {
      return error;
    }
  }

  if (planilha.removidos.length > 0) {
    const { error } = await supabase.from("alunos").delete().in("id", planilha.removidos);

    if (error) {
      return error;
    }

    planilha.removidos = [];
  }

  return null;
}

/** Exclui o lançamento; os alunos saem junto, pela regra de cascata do banco. */
export async function excluirLancamento(supabase, id) {
  const { error } = await supabase.from("lancamentos").delete().eq("id", id);

  return error;
}
