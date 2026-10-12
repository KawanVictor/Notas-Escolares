import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL } from "./config.js";
import * as conta from "./conta.js";
import * as dados from "./dados.js";
import * as notas from "./notas.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELAS = ["carregando", "entrar", "lista", "planilha"];
const FORMULARIOS = ["entrar", "cadastro", "recuperar", "nova-senha"];
const CHAVES_ATIVIDADES = Object.keys(notas.TODAS_ATIVIDADES);

const $ = (id) => document.getElementById(id);

// O link de "esqueci minha senha" volta para esta página com type=recovery no endereço.
// Precisa ser lido antes de criar o cliente, que consome e limpa esse trecho.
let sessao = conta.estadoInicialDaSessao(location.hash.includes("type=recovery"));
let planilha = null;
let alterado = false;
// Conta as edições, para saber se algo mudou enquanto uma gravação estava em andamento.
let edicoes = 0;
let supabase = null;

if (SUPABASE_URL && SUPABASE_CHAVE_PUBLICA) {
  supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA);
  montarPagina();
  // O retorno roda fora do evento porque chamar o Supabase de dentro dele pode travar a sessão.
  supabase.auth.onAuthStateChange((evento, nova) => setTimeout(() => aoMudarSessao(evento, nova), 0));
} else {
  $("mensagem-carregando").textContent =
    "O sistema ainda não foi configurado: preencha o endereço e a chave do Supabase em js/config.js.";
}

// ----- Telas e avisos -----

function mostrarTela(nome) {
  for (const tela of TELAS) {
    $(`tela-${tela}`).hidden = tela !== nome;
  }

  $("area-logada").hidden = nome !== "lista" && nome !== "planilha";
}

function mostrarFormulario(nome) {
  for (const formulario of FORMULARIOS) {
    $(`form-${formulario}`).hidden = formulario !== nome;
  }

  avisar("aviso-entrar", "");
}

function avisar(id, texto, erro = false) {
  $(id).textContent = texto;
  $(id).classList.toggle("erro", erro);
}

function definirStatus(texto, tipo = "") {
  $("status").textContent = texto;
  $("status").className = tipo;
}

function marcarAlterado() {
  alterado = true;
  edicoes += 1;
  atualizarBotaoSalvar();
  definirStatus("Há alterações ainda não salvas.", "alerta");
}

/** Desabilita o botão enquanto a operação roda, para evitar cliques repetidos. */
async function comBotaoOcupado(botao, operacao) {
  botao.disabled = true;

  try {
    return await operacao();
  } finally {
    botao.disabled = false;
  }
}

/** Pergunta em um diálogo e devolve o valor do botão escolhido ("cancelar" se fechar com Esc). */
function perguntar(mensagem, botoes) {
  const dialogo = $("dialogo");

  return new Promise((resolver) => {
    const escuta = new AbortController();
    const concluir = (valor) => {
      escuta.abort();
      resolver(valor);

      if (dialogo.open) {
        dialogo.close();
      }
    };

    $("dialogo-mensagem").textContent = mensagem;
    $("dialogo-botoes").replaceChildren(
      ...botoes.map(({ valor, texto, estilo = "secundario" }) => {
        const botao = document.createElement("button");

        botao.type = "button";
        botao.textContent = texto;
        botao.className = estilo;
        botao.addEventListener("click", () => concluir(valor));

        return botao;
      })
    );
    // "cancel" só acontece ao fechar com Esc. O evento "close" não serve aqui: ele chega atrasado
    // e poderia cancelar a pergunta seguinte, se ela fosse aberta logo depois desta.
    dialogo.addEventListener("cancel", () => concluir("cancelar"), { signal: escuta.signal });
    dialogo.showModal();
  });
}

/** Antes de sair da planilha: oferece salvar. Devolve false se o usuário desistiu de sair. */
async function podeSairDaPlanilha() {
  if (!alterado) {
    return true;
  }

  const resposta = await perguntar("Há alterações não salvas neste lançamento.", [
    { valor: "cancelar", texto: "Continuar editando" },
    { valor: "descartar", texto: "Descartar", estilo: "perigo" },
    { valor: "salvar", texto: "Salvar", estilo: "primario" }
  ]);

  if (resposta === "salvar") {
    return salvar();
  }

  return resposta === "descartar";
}

// ----- Montagem inicial -----

function montarPagina() {
  for (const [chave, rotulo] of Object.entries(notas.CAMPOS_CABECALHO)) {
    const campo = document.createElement("label");
    const entrada = document.createElement("input");

    entrada.id = `campo-${chave}`;
    entrada.type = chave === "data" ? "date" : "text";
    entrada.maxLength = 200;
    entrada.autocomplete = "off";
    entrada.addEventListener("input", () => {
      marcarAlterado();
      atualizarTitulo();
    });
    campo.append(rotulo, entrada);
    $("dados-turma").append(campo);
  }

  for (const [chave, rotulo] of Object.entries(notas.TODAS_ATIVIDADES)) {
    const titulo = document.createElement("th");
    const curto = document.createElement("span");
    const completo = document.createElement("span");

    // Na tela aparece o nome curto, para a tabela caber; o completo vai na dica, na impressão e para leitores de tela.
    curto.className = "rotulo-curto";
    curto.textContent = notas.ROTULOS_CURTOS[chave];
    curto.setAttribute("aria-hidden", "true");
    completo.className = "rotulo-completo";
    completo.textContent = rotulo;
    titulo.title = rotulo;
    titulo.append(curto, completo);
    $("titulos-atividades").append(titulo);
  }

  for (const caixa of document.querySelectorAll("[data-mostrar-senha]")) {
    caixa.addEventListener("change", () => {
      $(caixa.dataset.mostrarSenha).type = caixa.checked ? "text" : "password";
    });
  }

  for (const botao of document.querySelectorAll("[data-formulario]")) {
    botao.addEventListener("click", () => mostrarFormulario(botao.dataset.formulario));
  }

  $("form-entrar").addEventListener("submit", entrar);
  $("form-cadastro").addEventListener("submit", criarConta);
  $("form-recuperar").addEventListener("submit", pedirRecuperacao);
  $("form-nova-senha").addEventListener("submit", salvarSenhaNova);
  $("btn-sair").addEventListener("click", sair);
  $("btn-novo").addEventListener("click", () => abrirPlanilha(dados.novaPlanilha(), { data: notas.dataDeHoje() }));
  $("btn-voltar").addEventListener("click", async () => {
    if (await podeSairDaPlanilha()) {
      mostrarLista();
    }
  });
  $("btn-adicionar").addEventListener("click", adicionarAluno);
  $("btn-salvar").addEventListener("click", salvar);
  $("btn-csv").addEventListener("click", exportarCsv);
  $("btn-imprimir").addEventListener("click", () => window.print());

  // Na impressão os dados da turma aparecem sempre, mesmo que estejam recolhidos na tela.
  let turmaEstavaAberta = false;

  window.addEventListener("beforeprint", () => {
    turmaEstavaAberta = $("detalhes-turma").open;
    $("detalhes-turma").open = true;
  });
  window.addEventListener("afterprint", () => {
    $("detalhes-turma").open = turmaEstavaAberta;
  });

  document.addEventListener("keydown", (evento) => {
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "s" && !$("tela-planilha").hidden) {
      evento.preventDefault();
      salvar();
    }
  });

  window.addEventListener("beforeunload", (evento) => {
    if (alterado) {
      evento.preventDefault();
    }
  });
}

// ----- Conta -----

async function aoMudarSessao(evento, nova) {
  const decisao = conta.decidirSessao(sessao, evento, nova);

  sessao = decisao.estado;

  if (decisao.acao === "manter") {
    return;
  }

  if (decisao.acao === "nova-senha") {
    mostrarTela("entrar");
    mostrarFormulario("nova-senha");
    return;
  }

  if (decisao.acao === "entrar") {
    planilha = null;
    alterado = false;
    mostrarTela("entrar");
    mostrarFormulario("entrar");
    return;
  }

  $("usuario-email").textContent = nova.user.email ?? "";

  const idNoEndereco = location.hash.slice(1);

  if (UUID.test(idNoEndereco)) {
    await abrirLancamento(idNoEndereco);
  } else {
    await mostrarLista();
  }
}

const enderecoDoSite = () => location.origin + location.pathname;

async function entrar(evento) {
  evento.preventDefault();

  await comBotaoOcupado(evento.submitter, async () => {
    const erro = await conta.entrar(supabase, $("email").value, $("current-password").value);

    if (erro) {
      avisar("aviso-entrar", erro, true);
    }
  });
}

async function criarConta(evento) {
  evento.preventDefault();

  await comBotaoOcupado(evento.submitter, async () => {
    const { erro, aviso } = await conta.criarConta(
      supabase,
      $("cadastro-email").value,
      $("new-password").value,
      enderecoDoSite()
    );

    if (erro) {
      avisar("aviso-entrar", erro, true);
    } else if (aviso) {
      mostrarFormulario("entrar");
      avisar("aviso-entrar", aviso);
    }
  });
}

async function pedirRecuperacao(evento) {
  evento.preventDefault();

  await comBotaoOcupado(evento.submitter, async () => {
    const { erro, aviso } = await conta.pedirRecuperacao(supabase, $("recuperar-email").value, enderecoDoSite());

    if (erro) {
      avisar("aviso-entrar", erro, true);
    } else {
      mostrarFormulario("entrar");
      avisar("aviso-entrar", aviso);
    }
  });
}

async function salvarSenhaNova(evento) {
  evento.preventDefault();

  await comBotaoOcupado(evento.submitter, async () => {
    const { erro, usuario } = await conta.trocarSenha(supabase, $("senha-nova").value);

    if (erro) {
      avisar("aviso-entrar", erro, true);
      return;
    }

    sessao = { ...sessao, recuperandoSenha: false };
    $("form-nova-senha").reset();
    await aoMudarSessao("SIGNED_IN", { user: usuario });
  });
}

async function sair() {
  if (!(await podeSairDaPlanilha())) {
    return;
  }

  alterado = false;
  history.replaceState(null, "", location.pathname + location.search);

  const { error } = await supabase.auth.signOut();

  if (error) {
    avisar("aviso-lista", conta.traduzirErro(error), true);
  }
}

// ----- Lista de lançamentos -----

async function mostrarLista() {
  planilha = null;
  alterado = false;
  history.replaceState(null, "", location.pathname + location.search);
  mostrarTela("lista");
  avisar("aviso-lista", "Carregando…");

  const { lancamentos, erro } = await dados.listarLancamentos(supabase);

  if (erro) {
    avisar("aviso-lista", conta.traduzirErro(erro), true);
    return;
  }

  avisar("aviso-lista", "");
  desenharLista(lancamentos);
}

function nomeDoLancamento(cabecalho) {
  return [cabecalho.turma, cabecalho.disciplina, cabecalho.trimestre].filter(Boolean).join(" · ");
}

function desenharLista(lancamentos) {
  const lista = $("lista-lancamentos");

  lista.replaceChildren();

  if (lancamentos.length === 0) {
    const vazio = document.createElement("li");

    vazio.className = "vazio";
    vazio.textContent = "Nenhum lançamento ainda. Clique em Novo lançamento para começar.";
    lista.append(vazio);
    return;
  }

  for (const lancamento of lancamentos) {
    const item = document.createElement("li");
    const texto = document.createElement("div");
    const titulo = document.createElement("span");
    const detalhe = document.createElement("span");
    const acoes = document.createElement("div");
    const abrir = document.createElement("button");
    const excluir = document.createElement("button");
    const totalAlunos = lancamento.alunos?.[0]?.count ?? 0;
    const atualizado = new Date(lancamento.atualizado_em).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    });

    titulo.className = "titulo";
    titulo.textContent = nomeDoLancamento(lancamento) || "Lançamento sem nome";
    detalhe.className = "suave";
    detalhe.textContent = [
      lancamento.escola,
      `${totalAlunos} ${totalAlunos === 1 ? "aluno" : "alunos"}`,
      `alterado em ${atualizado}`
    ].filter(Boolean).join(" · ");
    texto.append(titulo, detalhe);

    abrir.type = "button";
    abrir.className = "primario";
    abrir.textContent = "Abrir";
    abrir.addEventListener("click", () => comBotaoOcupado(abrir, () => abrirLancamento(lancamento.id)));

    excluir.type = "button";
    excluir.className = "perigo";
    excluir.textContent = "Excluir";
    excluir.addEventListener("click", () => excluirLancamento(lancamento, excluir));

    acoes.className = "acoes";
    acoes.append(abrir, excluir);
    item.append(texto, acoes);
    lista.append(item);
  }
}

async function excluirLancamento(lancamento, botao) {
  const nome = nomeDoLancamento(lancamento) || "este lançamento";
  const resposta = await perguntar(`Excluir ${nome} com todos os alunos e notas? Isso não pode ser desfeito.`, [
    { valor: "cancelar", texto: "Cancelar" },
    { valor: "excluir", texto: "Excluir", estilo: "perigo" }
  ]);

  if (resposta !== "excluir") {
    return;
  }

  await comBotaoOcupado(botao, async () => {
    const erro = await dados.excluirLancamento(supabase, lancamento.id);

    if (erro) {
      avisar("aviso-lista", conta.traduzirErro(erro), true);
    } else {
      await mostrarLista();
    }
  });
}

// ----- Planilha -----

async function abrirLancamento(id) {
  const lido = await dados.carregarLancamento(supabase, id);

  if (!lido.planilha) {
    await mostrarLista();
    avisar("aviso-lista", lido.erro ? conta.traduzirErro(lido.erro) : "Este lançamento não existe mais.", true);
    return;
  }

  abrirPlanilha(lido.planilha, lido.cabecalho);
  definirStatus("Lançamento carregado.");
}

function abrirPlanilha(nova, cabecalho) {
  planilha = nova;
  alterado = false;

  for (const chave of Object.keys(notas.CAMPOS_CABECALHO)) {
    $(`campo-${chave}`).value = cabecalho[chave] ?? "";
  }

  // Lançamento já salvo abre com os dados da turma recolhidos, deixando mais espaço para a tabela.
  $("detalhes-turma").open = !planilha.id;
  history.replaceState(null, "", location.pathname + location.search + (planilha.id ? `#${planilha.id}` : ""));
  atualizarTitulo();
  atualizarBotaoSalvar();
  desenharTabela();
  definirStatus("Novo lançamento. Preencha os dados e clique em Salvar.");
  mostrarTela("planilha");
}

function lerCabecalho() {
  const cabecalho = {};

  for (const chave of Object.keys(notas.CAMPOS_CABECALHO)) {
    cabecalho[chave] = $(`campo-${chave}`).value.trim();
  }

  return cabecalho;
}

function atualizarTitulo() {
  const cabecalho = lerCabecalho();

  $("titulo-planilha").textContent = nomeDoLancamento(cabecalho) || "Novo lançamento";
  // Turma, disciplina e trimestre já estão no título; o resumo mostra o restante.
  $("resumo-turma").textContent = [
    cabecalho.escola,
    cabecalho.ano_serie,
    cabecalho.professor,
    notas.formatarData(cabecalho.data)
  ].filter(Boolean).join(" · ");
}

/** O botão Salvar mostra se há algo pendente: "Salvar alterações", "Salvo" ou "Salvar" (lançamento novo). */
function atualizarBotaoSalvar() {
  const botao = $("btn-salvar");
  const nuncaSalvo = !planilha?.id;

  botao.textContent = alterado ? "Salvar alterações" : nuncaSalvo ? "Salvar" : "Salvo";
  botao.className = alterado || nuncaSalvo ? "primario" : "secundario";
  botao.classList.toggle("pendente", alterado);
  botao.title = alterado || nuncaSalvo ? "" : "Não há alterações para salvar";
}

function desenharTabela() {
  const corpo = $("corpo-tabela");

  corpo.replaceChildren();

  if (planilha.alunos.length === 0) {
    const linha = document.createElement("tr");
    const celula = document.createElement("td");

    celula.colSpan = 7 + CHAVES_ATIVIDADES.length;
    celula.className = "vazio";
    celula.textContent = "Nenhum aluno adicionado.";
    linha.append(celula);
    corpo.append(linha);
    return;
  }

  planilha.alunos.forEach((aluno, indice) => corpo.append(criarLinha(aluno, indice)));
}

function criarLinha(aluno, indice) {
  const linha = document.createElement("tr");
  const celulasDeMedia = {};

  const atualizarMedias = () => {
    const medias = notas.calcularMedias(aluno.notas);

    for (const [chave, celula] of Object.entries(celulasDeMedia)) {
      celula.textContent = notas.formatarMedia(medias[chave]);
      celula.className = `media ${notas.faixa(medias[chave])}`;
    }
  };

  const criarCelulaDeMedia = (chave) => {
    celulasDeMedia[chave] = document.createElement("td");

    return celulasDeMedia[chave];
  };

  const numero = document.createElement("td");

  numero.className = "numero";
  numero.textContent = indice + 1;
  linha.append(numero, criarCelulaDoNome(aluno, indice));

  for (const chave of Object.keys(notas.ATIVIDADES_PRINCIPAIS)) {
    linha.append(criarCelulaDeNota(aluno, chave, indice, atualizarMedias));
  }

  linha.append(criarCelulaDeMedia("media_total"));

  for (const chave of Object.keys(notas.AVALIACOES_INTEGRADAS)) {
    linha.append(criarCelulaDeNota(aluno, chave, indice, atualizarMedias));
  }

  linha.append(
    criarCelulaDeMedia("media_integrada"),
    criarCelulaDeMedia("media_final_integrada"),
    criarCelulaDeMedia("media_trimestral"),
    criarCelulaDeAcoes(aluno)
  );
  atualizarMedias();

  return linha;
}

function criarCelulaDoNome(aluno, indice) {
  const celula = document.createElement("td");
  const entrada = document.createElement("input");

  celula.className = "nome";
  entrada.type = "text";
  entrada.value = aluno.nome;
  entrada.maxLength = 200;
  entrada.autocomplete = "off";
  entrada.placeholder = "Nome do aluno";
  entrada.setAttribute("aria-label", `Nome do aluno ${indice + 1}`);
  entrada.dataset.coluna = "nome";
  entrada.addEventListener("input", () => {
    aluno.nome = entrada.value;
    marcarAlterado();
  });
  entrada.addEventListener("keydown", descerComEnter);
  celula.append(entrada);

  return celula;
}

function criarCelulaDeNota(aluno, chave, indice, atualizarMedias) {
  const celula = document.createElement("td");
  const entrada = document.createElement("input");
  let ultimoValido = aluno.notas[chave];

  // Campo de texto com teclado decimal: aceita vírgula e não apaga a nota no meio da digitação.
  entrada.type = "text";
  entrada.inputMode = "decimal";
  entrada.autocomplete = "off";
  entrada.value = aluno.notas[chave];
  entrada.title = notas.TODAS_ATIVIDADES[chave];
  entrada.setAttribute("aria-label", `${notas.TODAS_ATIVIDADES[chave]}, aluno ${indice + 1}`);
  entrada.dataset.coluna = chave;
  entrada.addEventListener("input", () => {
    if (!notas.NOTA_EM_DIGITACAO.test(entrada.value)) {
      entrada.value = ultimoValido;
      return;
    }

    ultimoValido = entrada.value;
    aluno.notas[chave] = entrada.value;
    atualizarMedias();
    marcarAlterado();
  });
  // A nota só é arrumada ao sair do campo, para não atrapalhar a digitação de decimais.
  entrada.addEventListener("change", () => {
    ultimoValido = notas.normalizarNota(entrada.value);
    entrada.value = ultimoValido;
    aluno.notas[chave] = ultimoValido;
    atualizarMedias();
  });
  entrada.addEventListener("keydown", descerComEnter);
  celula.append(entrada);

  return celula;
}

function criarCelulaDeAcoes(aluno) {
  const celula = document.createElement("td");
  const botao = document.createElement("button");

  celula.className = "no-print";
  botao.type = "button";
  botao.className = "perigo pequeno";
  botao.textContent = "Remover";
  botao.addEventListener("click", () => removerAluno(aluno));
  celula.append(botao);

  return celula;
}

/** Enter confirma o campo e vai para a mesma coluna do próximo aluno. */
function descerComEnter(evento) {
  if (evento.key !== "Enter") {
    return;
  }

  const entrada = evento.currentTarget;
  const proxima = entrada.closest("tr").nextElementSibling?.querySelector(`[data-coluna="${entrada.dataset.coluna}"]`);

  evento.preventDefault();

  if (proxima) {
    proxima.focus();
    proxima.select();
  } else {
    entrada.blur();
  }
}

function adicionarAluno() {
  if (planilha.alunos.length >= dados.MAXIMO_DE_ALUNOS) {
    definirStatus(`Um lançamento aceita no máximo ${dados.MAXIMO_DE_ALUNOS} alunos.`, "erro");
    return;
  }

  planilha.alunos.push(dados.criarAluno());
  desenharTabela();
  marcarAlterado();

  const nomeNovo = $("corpo-tabela").lastElementChild.querySelector('[data-coluna="nome"]');

  nomeNovo.scrollIntoView({ block: "nearest" });
  nomeNovo.focus();
}

async function removerAluno(aluno) {
  const resposta = await perguntar(`Remover ${aluno.nome || "este aluno"}?`, [
    { valor: "cancelar", texto: "Cancelar" },
    { valor: "remover", texto: "Remover", estilo: "perigo" }
  ]);

  if (resposta !== "remover") {
    return;
  }

  dados.removerAluno(planilha, aluno);
  desenharTabela();
  marcarAlterado();
}

/** Grava o lançamento no banco. Devolve true se salvou. */
async function salvar() {
  const botao = $("btn-salvar");

  if (!planilha || botao.disabled) {
    return false;
  }

  return comBotaoOcupado(botao, async () => {
    const edicoesAoSalvar = edicoes;

    definirStatus("Salvando…");
    botao.textContent = "Salvando…";

    const erro = await dados.gravarPlanilha(supabase, planilha, lerCabecalho());

    if (erro) {
      atualizarBotaoSalvar();
      definirStatus(`Não foi possível salvar: ${conta.traduzirErro(erro)}`, "erro");
      return false;
    }

    history.replaceState(null, "", `${location.pathname}${location.search}#${planilha.id}`);
    // Se algo foi digitado enquanto a gravação rodava, o lançamento continua com alterações pendentes.
    alterado = edicoes !== edicoesAoSalvar;
    atualizarBotaoSalvar();

    if (alterado) {
      definirStatus("Há alterações ainda não salvas.", "alerta");
    } else {
      definirStatus(`Dados salvos às ${new Date().toLocaleTimeString("pt-BR", { timeStyle: "short" })}.`);
    }

    return true;
  });
}

function exportarCsv() {
  const cabecalho = lerCabecalho();
  const nome = nomeDoLancamento(cabecalho).replace(/[\\/:*?"<>|]+/g, "").replaceAll(" · ", " - ");
  // O BOM no início faz o Excel reconhecer os acentos.
  const arquivo = new Blob(["\uFEFF" + notas.gerarCsv(cabecalho, planilha.alunos)], { type: "text/csv;charset=utf-8" });
  const endereco = URL.createObjectURL(arquivo);
  const link = document.createElement("a");

  link.href = endereco;
  link.download = `${nome || "lancamento-notas"}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(endereco);
  definirStatus(alterado ? "CSV exportado. Há alterações ainda não salvas." : "CSV exportado.", alterado ? "alerta" : "");
}
