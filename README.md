# Lançamento de Notas Escolares

Aplicativo de computador para lançar as notas de uma turma, calcular as médias do trimestre e gerar a planilha em CSV ou PDF. Funciona sem internet e os dados ficam apenas no seu computador.

## Como abrir

É preciso ter o [Python 3.10 ou mais novo](https://www.python.org/downloads/) instalado. Não há mais nada para instalar.

```
python app.py
```

## Como usar

1. Preencha os dados da turma (escola, turma, disciplina, trimestre, professor e data).
2. Clique em **Adicionar aluno** para cada aluno e digite o nome e as notas.
3. Clique em **Salvar** (ou `Ctrl+S`). Na primeira vez, escolha o nome do arquivo.

As notas vão de 0 a 6 e aceitam vírgula ou ponto (`4,5` ou `4.5`). `Enter` confirma a nota e desce para o próximo aluno; `Tab` vai para a próxima coluna.

| Botão | O que faz |
|---|---|
| Adicionar aluno | Cria uma linha nova no fim da tabela |
| Abrir (`Ctrl+O`) | Abre um lançamento salvo |
| Salvar (`Ctrl+S`) | Grava no arquivo atual |
| Salvar como | Grava em outro arquivo, por exemplo para outra turma |
| Exportar CSV | Gera uma planilha que abre direto no Excel |
| Imprimir / PDF | Abre a planilha no navegador para imprimir ou salvar em PDF |
| Novo lançamento (`Ctrl+N`) | Começa uma planilha em branco |

O programa avisa antes de fechar ou trocar de planilha se houver alterações não salvas, e ao abrir retoma o último arquivo usado.

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

## Onde ficam os dados

Cada lançamento é um arquivo `.json`, salvo por padrão na pasta `dados/`. Use um arquivo por turma, disciplina e trimestre.

A pasta `dados/` não é enviada ao Git, porque contém nomes e notas de alunos. Faça a sua própria cópia de segurança.

## Para quem for mexer no código

| Arquivo | Conteúdo |
|---|---|
| `app.py` | Interface (Tkinter) |
| `notas.py` | Regras: cálculo das médias, leitura e gravação, CSV e página de impressão |
| `test_notas.py` | Testes das regras |

As atividades, a nota máxima e os limites das faixas estão no início de `notas.py`.

Para rodar os testes:

```
python -m unittest test_notas
```
