# Lançamento de Notas Escolares

Site para lançar as notas de uma turma, calcular as médias do trimestre e gerar a planilha em CSV ou PDF. Cada professor entra com a própria conta e acessa os seus lançamentos de qualquer computador ou celular.

## Como usar

1. Abra o site e clique em **Criar conta**. Confirme o cadastro pelo link enviado ao seu e-mail e depois entre.
2. Clique em **Novo lançamento** e preencha os dados da turma (escola, turma, disciplina, trimestre, professor e data).
3. Clique em **Adicionar aluno** para cada aluno e digite o nome e as notas.
4. Clique em **Salvar** (ou `Ctrl+S`). Nada é gravado sozinho: o site avisa se você tentar sair com alterações não salvas.

As notas vão de 0 a 6 e aceitam vírgula ou ponto (`4,5` ou `4.5`). `Enter` confirma a nota e desce para o próximo aluno; `Tab` vai para a próxima coluna.

| Botão | O que faz |
|---|---|
| Novo lançamento | Começa uma planilha em branco |
| Abrir / Excluir | Abre ou apaga um lançamento da sua lista |
| Adicionar aluno | Cria uma linha nova no fim da tabela |
| Salvar (`Ctrl+S`) | Grava o lançamento na sua conta |
| Exportar CSV | Baixa uma planilha que abre direto no Excel |
| Imprimir / PDF | Abre a impressão do navegador, que também salva em PDF |
| Voltar | Retorna à lista de lançamentos |

Use um lançamento por turma, disciplina e trimestre. Cada conta só enxerga os próprios lançamentos.

## Como as médias são calculadas

| Média | Cálculo |
|---|---|
| Média total | Média das 8 atividades principais |
| Média avaliação integrada | Média das 2 avaliações integradas |
| Média final integrada | Média entre a média total e a média da avaliação integrada |
| Média trimestral | Média entre a média total e a média final integrada |

Na prática, a média trimestral equivale a **75% da média total + 25% da média das avaliações integradas**.

Campos em branco são ignorados e não contam como zero. Para a nota entrar como zero, digite `0`.

As cores indicam a faixa da média:

| Faixa | Média |
|---|---|
| Boa (verde) | 4,5 ou mais |
| Intermediária (amarelo) | de 3,0 a 4,49 |
| Baixa (vermelho) | abaixo de 3,0 |

## Para quem mantém o sistema

O site é estático (HTML, CSS e JavaScript, sem etapa de build) e fica hospedado na Vercel. As contas e os dados ficam no Supabase.

| Caminho | Conteúdo |
|---|---|
| `public/` | O site publicado: `index.html`, `style.css` e a pasta `js/` |
| `public/js/app.js` | Telas, login e gravação no Supabase |
| `public/js/notas.js` | Regras: cálculo das médias e geração do CSV |
| `public/js/config.js` | Endereço e chave pública do projeto no Supabase |
| `supabase/migrations/` | Tabelas, regras de acesso e gatilho do banco |
| `tests/` | Testes das regras |
| `vercel.json` | Cabeçalhos de segurança do site |
| `desktop/` | Versão antiga para computador, que funciona sem internet |

### Rodar no seu computador

É preciso ter o Node.js 20 ou mais novo e o Python 3.

```
npm run dev
```

O site abre em `http://localhost:8123`. Para rodar os testes das regras:

```
npm test
```

### Publicar na Vercel

1. Envie o repositório para o GitHub.
2. Em [vercel.com](https://vercel.com), importe o repositório. Escolha o preset **Other** e deixe os comandos de build em branco; a Vercel publica a pasta `public/`.
3. No painel do Supabase, em **Authentication > URL Configuration**, coloque o endereço do site publicado em **Site URL**. Sem isso, os links de confirmação de conta e de recuperação de senha apontam para o endereço errado.

### Banco de dados (Supabase)

O projeto se chama **Notas Escolares** e fica na região de São Paulo. As tabelas são `lancamentos` (dados da turma) e `alunos` (nome e notas).

A segurança vem das regras de acesso por linha (RLS): cada usuário só lê e altera os lançamentos de que é dono, e quem não entrou não acessa nada. Por isso a chave publicável pode ficar em `config.js`. A chave secreta (`service_role` ou `sb_secret_...`) nunca deve ir para o repositório.

Para recriar o banco em outro projeto, execute o arquivo de `supabase/migrations/` no SQL Editor e atualize `config.js` com o endereço e a chave publicável do projeto novo.

Pontos de atenção:

- **Plano gratuito:** o Supabase pausa projetos sem uso por cerca de uma semana. Basta reativar no painel; os dados continuam lá.
- **E-mails:** o envio de e-mails padrão do Supabase aceita poucas mensagens por hora. Para uma escola inteira, configure um servidor de e-mail próprio em **Authentication > Emails**.
- **Dados de alunos:** o banco guarda nomes e notas de menores. Combine o uso com a escola e faça cópias de segurança.

### Mudar atividades, nota máxima ou faixas

As atividades, a nota máxima e os limites das faixas estão no início de `public/js/notas.js`. Uma atividade nova também precisa de uma coluna na tabela `alunos`.

### Versão desktop

A pasta `desktop/` guarda a versão para computador (Python com Tkinter), que salva arquivos `.json` locais e não conversa com o site.

```
python desktop/app.py
```
