// Conta do usuário: entrar, criar conta, recuperar senha e acompanhar a sessão.
// Não mexe na página: recebe o cliente do Supabase por parâmetro, o que permite testar com um serviço simulado.

/** Mensagens do Supabase chegam em inglês; estas são as que o usuário costuma encontrar. */
export function traduzirErro(erro) {
  const mensagem = erro?.message ?? "";
  const conhecidas = [
    ["Invalid login credentials", "E-mail ou senha incorretos."],
    ["Email not confirmed", "Confirme o seu e-mail pelo link que enviamos antes de entrar."],
    ["User already registered", "Já existe uma conta com este e-mail."],
    // A mais específica vem antes: "New password should be different" também contém "password should be".
    ["New password should be different", "A senha nova precisa ser diferente da anterior."],
    ["Password should be", "A senha é fraca demais. Use pelo menos 8 caracteres."],
    ["rate limit", "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo."],
    ["Failed to fetch", "Sem conexão com o servidor. Verifique a internet e tente de novo."],
    ["NetworkError", "Sem conexão com o servidor. Verifique a internet e tente de novo."]
  ];
  const conhecida = conhecidas.find(([trecho]) => mensagem.toLowerCase().includes(trecho.toLowerCase()));

  return conhecida ? conhecida[1] : (mensagem || "Não foi possível concluir a operação.");
}

/** Devolve a mensagem de erro, ou null se entrou. A troca de tela vem depois, pelo aviso de sessão. */
export async function entrar(supabase, email, senha) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });

  return error ? traduzirErro(error) : null;
}

/** Devolve { erro } ou { aviso }; o aviso aparece quando falta confirmar o e-mail. */
export async function criarConta(supabase, email, senha, enderecoDeRetorno) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
    options: { emailRedirectTo: enderecoDeRetorno }
  });

  if (error) {
    return { erro: traduzirErro(error), aviso: null };
  }

  return {
    erro: null,
    aviso: data.session ? null : "Conta criada. Confirme pelo link que enviamos para o seu e-mail e depois entre."
  };
}

export async function pedirRecuperacao(supabase, email, enderecoDeRetorno) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: enderecoDeRetorno });

  if (error) {
    return { erro: traduzirErro(error), aviso: null };
  }

  // A mensagem não confirma se o e-mail tem conta, para não revelar quem está cadastrado.
  return { erro: null, aviso: "Se houver uma conta com este e-mail, o link para criar a senha nova foi enviado." };
}

export async function trocarSenha(supabase, senhaNova) {
  const { data, error } = await supabase.auth.updateUser({ password: senhaNova });

  return error ? { erro: traduzirErro(error), usuario: null } : { erro: null, usuario: data.user };
}

export function estadoInicialDaSessao(enderecoTemRecuperacao) {
  return { recuperandoSenha: enderecoTemRecuperacao, iniciada: false, usuarioId: null };
}

/**
 * Decide o que a página deve fazer a cada aviso de sessão do Supabase. Devolve { acao, estado }:
 * "nova-senha" (pedir a senha nova), "manter" (não mexer na tela), "entrar" (tela de login) ou "abrir" (área logada).
 */
export function decidirSessao(estado, evento, sessao) {
  if ((estado.recuperandoSenha || evento === "PASSWORD_RECOVERY") && sessao) {
    return { acao: "nova-senha", estado: { ...estado, recuperandoSenha: true } };
  }

  const usuarioId = sessao?.user?.id ?? null;

  // O Supabase repete o aviso de sessão ao renovar o acesso ou ao voltar para a aba;
  // nesses casos a tela não pode ser redesenhada, senão a edição em andamento se perde.
  if (estado.iniciada && usuarioId === estado.usuarioId) {
    return { acao: "manter", estado: { ...estado, recuperandoSenha: false } };
  }

  // Sem sessão, um link de recuperação vencido ou inválido também cai aqui e volta ao login normal.
  return { acao: usuarioId ? "abrir" : "entrar", estado: { recuperandoSenha: false, iniciada: true, usuarioId } };
}
