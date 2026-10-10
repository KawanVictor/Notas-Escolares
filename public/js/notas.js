// Regras do lançamento de notas: cálculo das médias e exportação.
// Este módulo não depende da página nem do banco, então pode ser testado à parte.

export const NOTA_MAXIMA = 6;
export const LIMITE_BOA = 4.5;
export const LIMITE_INTERMEDIARIA = 3;

// Campos do cabeçalho da planilha. As chaves são os nomes das colunas no banco.
export const CAMPOS_CABECALHO = {
  escola: "Nome da escola",
  turma: "Turma",
  ano_serie: "Ano/Série",
  disciplina: "Disciplina",
  trimestre: "Trimestre",
  professor: "Professor",
  data: "Data"
};

// Atividades que entram na média total principal.
export const ATIVIDADES_PRINCIPAIS = {
  oralidade: "Oralidade / Expressão / Comunicação / Argumentação",
  leitura: "Leitura / Escuta / Fluência / Compreensão",
  producao_textual: "Produção textual",
  gramatica: "Gramática",
  ortografia: "Ortografia",
  participacao: "Participação",
  atividade1: "Atividade avaliativa 1",
  atividade2: "Atividade avaliativa 2"
};

export const AVALIACOES_INTEGRADAS = {
  integrada1: "Avaliação integrada 1",
  integrada2: "Avaliação integrada 2"
};

export const TODAS_ATIVIDADES = { ...ATIVIDADES_PRINCIPAIS, ...AVALIACOES_INTEGRADAS };

export const MEDIAS = {
  media_total: "Média total",
  media_integrada: "Média avaliação integrada",
  media_final_integrada: "Média final integrada",
  media_trimestral: "Média trimestral"
};

// Aceita a nota ainda pela metade ("4", "4,", "4,5"), com vírgula ou ponto.
export const NOTA_EM_DIGITACAO = /^\d{0,2}([.,]\d{0,2})?$/;

/** Data local no formato dos campos de data (aaaa-mm-dd). */
export function dataDeHoje(agora = new Date()) {
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/** "2026-10-09" -> "09/10/2026". Devolve o texto original se não for uma data nesse formato. */
export function formatarData(data) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data ?? "");

  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : (data ?? "");
}

/** Converte o que foi digitado em número entre 0 e NOTA_MAXIMA, ou null se estiver vazio/inválido. */
export function interpretarNota(valor) {
  const texto = String(valor ?? "").trim().replace(",", ".");

  if (texto === "") {
    return null;
  }

  const nota = Number(texto);

  if (!Number.isFinite(nota)) {
    return null;
  }

  return Math.min(NOTA_MAXIMA, Math.max(0, nota));
}

/** Nota com vírgula decimal e sem zeros sobrando: 4.5 -> "4,5", 6 -> "6". */
export function formatarNota(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  return valor.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

export function normalizarNota(valor) {
  return formatarNota(interpretarNota(valor));
}

/** Média sempre com duas casas e vírgula decimal: 4.5 -> "4,50". */
export function formatarMedia(valor) {
  return valor === null ? "" : valor.toFixed(2).replace(".", ",");
}

/** Média dos valores preenchidos. Campos vazios (null) são ignorados, não contam como zero. */
export function media(valores) {
  const validos = valores.filter((valor) => valor !== null);

  if (validos.length === 0) {
    return null;
  }

  return validos.reduce((soma, valor) => soma + valor, 0) / validos.length;
}

export function calcularMedias(notas) {
  const mediaTotal = media(Object.keys(ATIVIDADES_PRINCIPAIS).map((chave) => interpretarNota(notas[chave])));
  const mediaIntegrada = media(Object.keys(AVALIACOES_INTEGRADAS).map((chave) => interpretarNota(notas[chave])));

  // A média final integrada combina o desempenho principal com as avaliações integradas.
  const mediaFinalIntegrada = media([mediaTotal, mediaIntegrada]);

  // A média trimestral usa a média total e a média final integrada como resultado do período.
  // Com tudo preenchido, isso equivale a 75% da média total + 25% da média integrada.
  const mediaTrimestral = media([mediaTotal, mediaFinalIntegrada]);

  return {
    media_total: mediaTotal,
    media_integrada: mediaIntegrada,
    media_final_integrada: mediaFinalIntegrada,
    media_trimestral: mediaTrimestral
  };
}

/** Classifica a média em "boa", "intermediaria" ou "baixa" ("" quando não há média). */
export function faixa(valor) {
  if (valor === null) {
    return "";
  }

  if (valor >= LIMITE_BOA) {
    return "boa";
  }

  return valor >= LIMITE_INTERMEDIARIA ? "intermediaria" : "baixa";
}

export function novoAluno() {
  const notas = {};

  for (const chave of Object.keys(TODAS_ATIVIDADES)) {
    notas[chave] = "";
  }

  return { nome: "", notas };
}

/** Valores do aluno já formatados, na mesma ordem das colunas da tabela. */
export function linhaDoAluno(numero, aluno) {
  const medias = calcularMedias(aluno.notas);

  return [
    String(numero),
    aluno.nome,
    ...Object.keys(ATIVIDADES_PRINCIPAIS).map((chave) => normalizarNota(aluno.notas[chave])),
    formatarMedia(medias.media_total),
    ...Object.keys(AVALIACOES_INTEGRADAS).map((chave) => normalizarNota(aluno.notas[chave])),
    formatarMedia(medias.media_integrada),
    formatarMedia(medias.media_final_integrada),
    formatarMedia(medias.media_trimestral)
  ];
}

export function titulosDasColunas() {
  return [
    "Nº",
    "Nome do aluno",
    ...Object.values(ATIVIDADES_PRINCIPAIS),
    MEDIAS.media_total,
    ...Object.values(AVALIACOES_INTEGRADAS),
    MEDIAS.media_integrada,
    MEDIAS.media_final_integrada,
    MEDIAS.media_trimestral
  ];
}

function escaparCsv(valor) {
  const texto = String(valor ?? "");

  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** Planilha em CSV com ponto e vírgula e vírgula decimal, como o Excel em português espera. */
export function gerarCsv(cabecalho, alunos) {
  const linhas = [
    ...Object.entries(CAMPOS_CABECALHO).map(([chave, rotulo]) => [
      rotulo,
      chave === "data" ? formatarData(cabecalho[chave]) : (cabecalho[chave] ?? "")
    ]),
    [],
    titulosDasColunas(),
    ...alunos.map((aluno, indice) => linhaDoAluno(indice + 1, aluno))
  ];

  return linhas.map((linha) => linha.map(escaparCsv).join(";")).join("\r\n");
}
