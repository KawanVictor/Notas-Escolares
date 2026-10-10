import assert from "node:assert/strict";
import test from "node:test";

import * as conta from "../public/js/conta.js";
import { criarContasFalsas } from "./ajuda/supabase-falso.js";

const SITE = "https://exemplo.test/";
const falha = (mensagem) => ({ data: {}, error: new Error(mensagem) });

test("erros conhecidos do Supabase são traduzidos", () => {
  assert.equal(conta.traduzirErro(new Error("Invalid login credentials")), "E-mail ou senha incorretos.");
  assert.match(conta.traduzirErro(new Error("Email not confirmed")), /Confirme o seu e-mail/);
  assert.match(conta.traduzirErro(new Error("email rate limit exceeded")), /Muitas tentativas/);
  assert.match(conta.traduzirErro(new TypeError("Failed to fetch")), /Sem conexão/);
});

test("erro desconhecido mantém a mensagem original; sem mensagem usa um texto padrão", () => {
  assert.equal(conta.traduzirErro(new Error("algo inesperado")), "algo inesperado");
  assert.equal(conta.traduzirErro(null), "Não foi possível concluir a operação.");
});

test("entrar envia o e-mail sem espaços e a senha como digitada", async () => {
  const { supabase, chamadas } = criarContasFalsas();

  assert.equal(await conta.entrar(supabase, "  prof@escola.test ", " senha com espaco "), null);
  assert.deepEqual(chamadas, [["signInWithPassword", { email: "prof@escola.test", password: " senha com espaco " }]]);
});

test("entrar com senha errada devolve a mensagem traduzida", async () => {
  const { supabase } = criarContasFalsas({ signInWithPassword: falha("Invalid login credentials") });

  assert.equal(await conta.entrar(supabase, "prof@escola.test", "errada"), "E-mail ou senha incorretos.");
});

test("entrar antes de confirmar o e-mail explica o que falta", async () => {
  const { supabase } = criarContasFalsas({ signInWithPassword: falha("Email not confirmed") });

  assert.match(await conta.entrar(supabase, "prof@escola.test", "senha"), /Confirme o seu e-mail/);
});

test("criar conta pede a confirmação por e-mail e manda o link de volta ao site", async () => {
  const { supabase, chamadas } = criarContasFalsas({ signUp: { data: { session: null }, error: null } });
  const resultado = await conta.criarConta(supabase, " prof@escola.test", "senha-forte", SITE);

  assert.equal(resultado.erro, null);
  assert.match(resultado.aviso, /Confirme pelo link/);
  assert.deepEqual(chamadas[0], [
    "signUp",
    { email: "prof@escola.test", password: "senha-forte", options: { emailRedirectTo: SITE } }
  ]);
});

test("criar conta que já entra direto não mostra aviso", async () => {
  const { supabase } = criarContasFalsas({ signUp: { data: { session: { user: { id: "u1" } } }, error: null } });

  assert.deepEqual(await conta.criarConta(supabase, "prof@escola.test", "senha-forte", SITE), {
    erro: null,
    aviso: null
  });
});

test("criar conta com e-mail já cadastrado devolve o erro traduzido", async () => {
  const { supabase } = criarContasFalsas({ signUp: falha("User already registered") });

  assert.deepEqual(await conta.criarConta(supabase, "prof@escola.test", "senha-forte", SITE), {
    erro: "Já existe uma conta com este e-mail.",
    aviso: null
  });
});

test("recuperar senha manda o link de volta ao site e não revela se a conta existe", async () => {
  const { supabase, chamadas } = criarContasFalsas();
  const resultado = await conta.pedirRecuperacao(supabase, "prof@escola.test ", SITE);

  assert.equal(resultado.erro, null);
  assert.match(resultado.aviso, /Se houver uma conta/);
  assert.deepEqual(chamadas[0], ["resetPasswordForEmail", "prof@escola.test", { redirectTo: SITE }]);
});

test("trocar senha devolve o usuário, ou o erro traduzido", async () => {
  const certo = criarContasFalsas({ updateUser: { data: { user: { id: "u1" } }, error: null } });
  const errado = criarContasFalsas({ updateUser: falha("New password should be different from the old password.") });

  assert.deepEqual(await conta.trocarSenha(certo.supabase, "senha-nova"), { erro: null, usuario: { id: "u1" } });
  assert.deepEqual(certo.chamadas[0], ["updateUser", { password: "senha-nova" }]);
  assert.deepEqual(await conta.trocarSenha(errado.supabase, "senha-nova"), {
    erro: "A senha nova precisa ser diferente da anterior.",
    usuario: null
  });
});

// ----- Sessão -----

const sessaoDe = (id) => ({ user: { id, email: `${id}@escola.test` } });

test("ao abrir o site sem sessão, mostra a tela de entrada", () => {
  const { acao, estado } = conta.decidirSessao(conta.estadoInicialDaSessao(false), "INITIAL_SESSION", null);

  assert.equal(acao, "entrar");
  assert.deepEqual(estado, { recuperandoSenha: false, iniciada: true, usuarioId: null });
});

test("ao abrir o site com sessão, vai para a área logada", () => {
  const { acao, estado } = conta.decidirSessao(conta.estadoInicialDaSessao(false), "INITIAL_SESSION", sessaoDe("u1"));

  assert.equal(acao, "abrir");
  assert.equal(estado.usuarioId, "u1");
});

test("entrar e sair trocam de tela", () => {
  let passo = conta.decidirSessao(conta.estadoInicialDaSessao(false), "INITIAL_SESSION", null);

  passo = conta.decidirSessao(passo.estado, "SIGNED_IN", sessaoDe("u1"));
  assert.equal(passo.acao, "abrir");

  passo = conta.decidirSessao(passo.estado, "SIGNED_OUT", null);
  assert.equal(passo.acao, "entrar");
  assert.equal(passo.estado.usuarioId, null);
});

test("avisos repetidos da mesma sessão não redesenham a tela", () => {
  let passo = conta.decidirSessao(conta.estadoInicialDaSessao(false), "INITIAL_SESSION", sessaoDe("u1"));

  for (const evento of ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"]) {
    passo = conta.decidirSessao(passo.estado, evento, sessaoDe("u1"));
    assert.equal(passo.acao, "manter", evento);
  }
});

test("trocar de conta na mesma aba abre a área da conta nova", () => {
  let passo = conta.decidirSessao(conta.estadoInicialDaSessao(false), "INITIAL_SESSION", sessaoDe("u1"));

  passo = conta.decidirSessao(passo.estado, "SIGNED_IN", sessaoDe("u2"));
  assert.equal(passo.acao, "abrir");
  assert.equal(passo.estado.usuarioId, "u2");
});

test("link de recuperação pede a senha nova antes de liberar a área logada", () => {
  let passo = conta.decidirSessao(conta.estadoInicialDaSessao(true), "SIGNED_IN", sessaoDe("u1"));

  assert.equal(passo.acao, "nova-senha");

  passo = conta.decidirSessao(passo.estado, "PASSWORD_RECOVERY", sessaoDe("u1"));
  assert.equal(passo.acao, "nova-senha");
  assert.equal(passo.estado.usuarioId, null);
});

test("aviso de recuperação vale mesmo sem a marca no endereço", () => {
  const passo = conta.decidirSessao(conta.estadoInicialDaSessao(false), "PASSWORD_RECOVERY", sessaoDe("u1"));

  assert.equal(passo.acao, "nova-senha");
  assert.equal(passo.estado.recuperandoSenha, true);
});

test("depois de salvar a senha nova, a área logada é liberada", () => {
  const recuperando = conta.decidirSessao(conta.estadoInicialDaSessao(true), "SIGNED_IN", sessaoDe("u1")).estado;
  const passo = conta.decidirSessao({ ...recuperando, recuperandoSenha: false }, "SIGNED_IN", sessaoDe("u1"));

  assert.equal(passo.acao, "abrir");
});

test("link de recuperação vencido volta ao login normal", () => {
  let passo = conta.decidirSessao(conta.estadoInicialDaSessao(true), "INITIAL_SESSION", null);

  assert.equal(passo.acao, "entrar");
  assert.equal(passo.estado.recuperandoSenha, false);

  passo = conta.decidirSessao(passo.estado, "SIGNED_IN", sessaoDe("u1"));
  assert.equal(passo.acao, "abrir");
});
