import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL } from "./config.js";
import * as notas from "./notas.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELAS = ["carregando", "entrar", "lista", "planilha"];
const FORMULARIOS = ["entrar", "cadastro", "recuperar", "nova-senha"];
const CHAVES_ATIVIDADES = Object.keys(notas.TODAS_ATIVIDADES);
const MAXIMO_DE_ALUNOS = 200;

const $ = (id) => document.getElementById(id);

// O link de "esqueci minha senha" volta para esta página com type=recovery no endereço.
// Precisa ser lido antes de criar o cliente, que consome e limpa esse trecho.
let recuperandoSenha = location.hash.includes("type=recovery");
let sessaoIniciada = false;
let usuario = null;
let planilha = null;
let alterado = false;
let supabase = null;

if (SUPABASE_URL && SUPABASE_CHAVE_PUBLICA) {
  supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA);
  montarPagina();
  // O retorno roda fora do evento porque chamar o Supabase de dentro dele pode travar a sessão.
  supabase.auth.onAuthStateChange((evento, sessao) => setTimeout(() => aoMudarSessao(evento, sessao), 0));
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
  definirStatus("Há alterações ainda não salvas.", "alerta");
}

/** Mensagens do Supabase chegam em inglês; estas são as que o usuário costuma encontrar. */
function traduzirErro(erro) {
  const mensagem = erro?.message ?? "";
  const conhecidas = [
    ["Invalid login credentials", "E-mail ou senha incorretos."],
    ["Email not confirmed", "Confirme o seu e-mail pelo link que enviamos antes de entrar."],
    ["User already registered", "Já existe uma conta com este e-mail."],
    ["Password should be", "A senha é fraca demais. Use pelo menos 8 caracteres."],
    ["New password should be different", "A senha nova precisa ser diferente da anterior."],
    ["rate limit", "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo."],
    ["Failed to fetch", "Sem conexão com o servidor. Verifique a internet e tente de novo."],
    ["NetworkError", "Sem conexão com o servidor. Verifique a internet e tente de novo."]
  ];
  const conhecida = conhecidas.find(([trecho]) => mensagem.toLowerCase().includes(trecho.toLowerCase()));

  return conhecida ? conhecida[1] : (mensagem || "Não foi possível concluir a operação.");
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
    $("dialogo-mensagem").textContent = mensagem;
    $("dialogo-botoes").replaceChildren(
      ...botoes.map(({ valor, texto, estilo = "secundario" }) => {
        const botao = document.createElement("button");

        botao.type = "button";
        botao.textContent = texto;
        botao.className = estilo;
        botao.addEventListener("click", () => {
          resolver(valor);
          dialogo.close();
        });

        return botao;
      })
    );
    // Fechar com Esc cai aqui; depois de um clique a promessa já está resolvida e isto não muda nada.
    dialogo.addEventListener("close", () => resolver("cancelar"), { once: true });
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

  for (const rotulo of Object.values(notas.TODAS_ATIVIDADES)) {
    const titulo = document.createElement("th");

    titulo.textContent = rotulo;
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
  $("btn-novo").addEventListener("click", () => abrirPlanilha(null, { data: notas.dataDeHoje() }, []));
  $("btn-voltar").addEventListener("click", async () => {
    if (await podeSairDaPlanilha()) {
      mostrarLista();
    }
  });
  $("btn-adicionar").addEventListener("click", adicionarAluno);
  $("btn-salvar").addEventListener("click", salvar);
  $("btn-csv").addEventListener("click", exportarCsv);
  $("btn-imprimir").addEventListener("click", () => window.print());

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

async function aoMudarSessao(evento, sessao) {
  if (evento === "PASSWORD_RECOVERY") {
    recuperandoSenha = true;
  }

  if (recuperandoSenha && sessao) {
    mostrarTela("entrar");
    mostrarFormulario("nova-senha");
    return;
  }

  // Link de recuperação vencido ou inválido: volta ao fluxo normal de entrada.
  recuperandoSenha = false;

  const novoUsuario = sessao?.user ?? null;

  // O Supabase repete o aviso de sessão ao renovar o acesso ou ao voltar para a aba;
  // nesses casos a tela não pode ser redesenhada, senão a edição em andamento se perde.
  if (sessaoIniciada && novoUsuario?.id === usuario?.id) {
    return;
  }

  sessaoIniciada = true;
  usuario = novoUsuario;

  if (!usuario) {
    planilha = null;
    alterado = false;
    mostrarTela("entrar");
    mostrarFormulario("entrar");
    return;
  }

  $("usuario-email").textContent = usuario.email ?? "";

  const idNoEndereco = location.hash.slice(1);

  if (UUID.test(idNoEndereco)) {
    await abrirLancamento(idNoEndereco);
  } else {
    await mostrarLista();
  }
}

async function entrar(evento) {
  evento.preventDefault();

  await comBotaoOcupado(evento.submitter, async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("current-password").value
    });

    if (error) {
      avisar("aviso-entrar", traduzirErro(error), true);
    }
  });
}

async function criarConta(evento) {
  evento.preventDefault();

  await comBotaoOcupado(evento.submitter, async () => {
    const { data, error } = await supabase.auth.signUp({
      email: $("cadastro-email").value.trim(),
      password: $("new-password").value,
      options: { emailRedirectTo: location.origin + location.pathname }
    });

    if (error) {
      avisar("aviso-entrar", traduzirErro(error), true);
    } else if (!data.session) {
      mostrarFormulario("entrar");
      avisar("aviso-entrar", "Conta criada. Confirme pelo link que enviamos para o seu e-mail e depois entre.");
    }
  });
}

async function pedirRecuperacao(evento) {
  evento.preventDefault();

  await comBotaoOcupado(evento.submitter, async () => {
    const { error } = await supabase.auth.resetPasswordForEmail($("recuperar-email").value.trim(), {
      redirectTo: location.origin + location.pathname
    });

    if (error) {
      avisar("aviso-entrar", traduzirErro(error), true);
    } else {
      mostrarFormulario("entrar");
      avisar("aviso-entrar", "Se houver uma conta com este e-mail, o link para criar a senha nova foi enviado.");
    }
  });
}

async function salvarSenhaNova(evento) {
  evento.preventDefault();

  await comBotaoOcupado(evento.submitter, async () => {
    const { data, error } = await supabase.auth.updateUser({ password: $("senha-nova").value });

    if (error) {
      avisar("aviso-entrar", traduzirErro(error), true);
      return;
    }

    recuperandoSenha = false;
    $("form-nova-senha").reset();
    await aoMudarSessao("SIGNED_IN", { user: data.user });
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
    avisar("aviso-lista", traduzirErro(error), true);
  }
}

// ----- Lista de lançamentos -----

async function mostrarLista() {
  planilha = null;
  alterado = false;
  history.replaceState(null, "", location.pathname + location.search);
  mostrarTela("lista");
  avisar("aviso-lista", "Carregando…");

  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, escola, turma, disciplina, trimestre, atualizado_em, alunos(count)")
    .order("atualizado_em", { ascending: false });

  if (error) {
    avisar("aviso-lista", traduzirErro(error), true);
    return;
  }

  avisar("aviso-lista", "");
  desenharLista(data);
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
    const { error } = await supabase.from("lancamentos").delete().eq("id", lancamento.id);

    if (error) {
      avisar("aviso-lista", traduzirErro(error), true);
    } else {
      await mostrarLista();
    }
  });
}

// ----- Planilha -----

async function abrirLancamento(id) {
  const { data, error } = await supabase.from("lancamentos").select("*, alunos(*)").eq("id", id).maybeSingle();

  if (error || !data) {
    await mostrarLista();
    avisar("aviso-lista", error ? traduzirErro(error) : "Este lançamento não existe mais.", true);
    return;
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

  abrirPlanilha(data.id, data, alunos);
  definirStatus("Lançamento carregado.");
}

function abrirPlanilha(id, cabecalho, alunos) {
  // "removidos" guarda os alunos já gravados que foram tirados da tabela e ainda precisam sair do banco.
  planilha = { id, alunos: alunos.length > 0 ? alunos : [criarAluno()], removidos: [] };
  alterado = false;

  for (const chave of Object.keys(notas.CAMPOS_CABECALHO)) {
    $(`campo-${chave}`).value = cabecalho[chave] ?? "";
  }

  history.replaceState(null, "", location.pathname + location.search + (id ? `#${id}` : ""));
  atualizarTitulo();
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
  $("titulo-planilha").textContent = nomeDoLancamento(lerCabecalho()) || "Novo lançamento";
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

function criarAluno() {
  return { id: crypto.randomUUID(), ...notas.novoAluno() };
}

function adicionarAluno() {
  if (planilha.alunos.length >= MAXIMO_DE_ALUNOS) {
    definirStatus(`Um lançamento aceita no máximo ${MAXIMO_DE_ALUNOS} alunos.`, "erro");
    return;
  }

  planilha.alunos.push(criarAluno());
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

  planilha.alunos = planilha.alunos.filter((item) => item !== aluno);
  planilha.removidos.push(aluno.id);
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
    definirStatus("Salvando…");

    const erro = await gravarPlanilha();

    if (erro) {
      definirStatus(`Não foi possível salvar: ${traduzirErro(erro)}`, "erro");
      return false;
    }

    alterado = false;
    history.replaceState(null, "", `${location.pathname}${location.search}#${planilha.id}`);
    definirStatus(`Dados salvos às ${new Date().toLocaleTimeString("pt-BR", { timeStyle: "short" })}.`);

    return true;
  });
}

/**
 * Grava cabeçalho, alunos e remoções, nessa ordem. Devolve o erro, se houver.
 * Se falhar no meio, nada do que está na tela se perde: basta salvar de novo.
 */
async function gravarPlanilha() {
  const cabecalho = lerCabecalho();

  cabecalho.data = cabecalho.data || null;

  if (planilha.id) {
    const { data, error } = await supabase.from("lancamentos").update(cabecalho).eq("id", planilha.id).select("id");

    if (error) {
      return error;
    }

    if (data.length === 0) {
      return new Error("este lançamento não existe mais (pode ter sido excluído em outro aparelho).");
    }
  } else {
    const { data, error } = await supabase.from("lancamentos").insert(cabecalho).select("id").single();

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

function exportarCsv() {
  const cabecalho = lerCabecalho();
  const nome = nomeDoLancamento(cabecalho).replace(/[\\/:*?"<>|]+/g, "").replaceAll(" · ", " - ");
  // O BOM no início faz o Excel reconhecer os acentos.
  const arquivo = new Blob(["﻿" + notas.gerarCsv(cabecalho, planilha.alunos)], { type: "text/csv;charset=utf-8" });
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
