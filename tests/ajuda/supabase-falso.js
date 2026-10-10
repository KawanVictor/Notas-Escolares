// Supabase simulado em memória, só com o que o site usa. Permite forçar falhas para testar a recuperação.

class Consulta {
  constructor(banco, tabela) {
    this.banco = banco;
    this.tabela = tabela;
    this.operacao = "select";
    this.filtros = [];
    this.colunas = "";
  }

  select(colunas = "") {
    if (this.operacao === "select") {
      this.colunas = colunas;
    }

    return this;
  }

  insert(valor) {
    this.operacao = "insert";
    this.valor = valor;
    return this;
  }

  update(valor) {
    this.operacao = "update";
    this.valor = valor;
    return this;
  }

  upsert(valor) {
    this.operacao = "upsert";
    this.valor = valor;
    return this;
  }

  delete() {
    this.operacao = "delete";
    return this;
  }

  eq(coluna, valor) {
    this.filtros.push((linha) => linha[coluna] === valor);
    return this;
  }

  in(coluna, valores) {
    this.filtros.push((linha) => valores.includes(linha[coluna]));
    return this;
  }

  order() {
    return this;
  }

  single() {
    this.unico = true;
    return this;
  }

  maybeSingle() {
    this.unico = true;
    return this;
  }

  then(resolver) {
    resolver(this.executar());
  }

  executar() {
    const { banco, tabela, operacao } = this;
    const combina = (linha) => this.filtros.every((filtro) => filtro(linha));
    const chamada = `${tabela}.${operacao}`;

    banco.chamadas.push(chamada);

    if (banco.falhas.has(chamada)) {
      return { data: null, error: new Error(`falha simulada em ${chamada}`) };
    }

    let linhas;

    if (operacao === "insert") {
      const nova = { id: crypto.randomUUID(), atualizado_em: new Date().toISOString(), ...this.valor };

      banco[tabela].push(nova);
      linhas = [nova];
    } else if (operacao === "update") {
      linhas = banco[tabela].filter(combina);
      linhas.forEach((linha) => Object.assign(linha, this.valor));
    } else if (operacao === "upsert") {
      for (const valor of this.valor) {
        const existente = banco[tabela].find((linha) => linha.id === valor.id);

        if (existente) {
          Object.assign(existente, valor);
        } else {
          banco[tabela].push({ ...valor });
        }
      }

      linhas = this.valor;
    } else if (operacao === "delete") {
      linhas = banco[tabela].filter(combina);
      banco[tabela] = banco[tabela].filter((linha) => !combina(linha));

      if (tabela === "lancamentos") {
        // Mesma regra de cascata do banco real.
        const excluidos = linhas.map((linha) => linha.id);

        banco.alunos = banco.alunos.filter((aluno) => !excluidos.includes(aluno.lancamento_id));
      }
    } else {
      linhas = banco[tabela].filter(combina).map((linha) => {
        if (tabela !== "lancamentos") {
          return linha;
        }

        const alunos = banco.alunos.filter((aluno) => aluno.lancamento_id === linha.id);

        return { ...linha, alunos: this.colunas.includes("alunos(count)") ? [{ count: alunos.length }] : alunos };
      });
    }

    return { data: this.unico ? (linhas[0] ?? null) : linhas, error: null };
  }
}

/**
 * Devolve { supabase, banco }. Em "banco" ficam as tabelas, a lista de chamadas feitas
 * e o conjunto "falhas": inclua "tabela.operacao" (ex.: "alunos.upsert") para essa chamada falhar.
 */
export function criarSupabaseFalso() {
  const banco = { lancamentos: [], alunos: [], chamadas: [], falhas: new Set() };

  return { banco, supabase: { from: (tabela) => new Consulta(banco, tabela) } };
}

/** Serviço de contas simulado: registra as chamadas e devolve as respostas configuradas. */
export function criarContasFalsas(respostas = {}) {
  const chamadas = [];
  const responder = (nome) => async (...argumentos) => {
    chamadas.push([nome, ...argumentos]);

    return respostas[nome] ?? { data: {}, error: null };
  };

  return {
    chamadas,
    supabase: {
      auth: {
        signInWithPassword: responder("signInWithPassword"),
        signUp: responder("signUp"),
        resetPasswordForEmail: responder("resetPasswordForEmail"),
        updateUser: responder("updateUser")
      }
    }
  };
}
