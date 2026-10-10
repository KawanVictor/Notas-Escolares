"""Regras do lançamento de notas: cálculo das médias, arquivos e exportação.

Este módulo não depende da interface, então pode ser testado e reutilizado à parte.
"""

import csv
import html
import json
import math
from datetime import date

NOTA_MAXIMA = 6.0
LIMITE_BOA = 4.5
LIMITE_INTERMEDIARIA = 3.0

# Campos do cabeçalho da planilha. Para adicionar outro campo, basta incluir aqui.
CAMPOS_CABECALHO = {
    "escola": "Nome da escola",
    "turma": "Turma",
    "ano_serie": "Ano/Série",
    "disciplina": "Disciplina",
    "trimestre": "Trimestre",
    "professor": "Professor",
    "data": "Data",
}

# Atividades que entram na média total principal.
ATIVIDADES_PRINCIPAIS = {
    "oralidade": "Oralidade / Expressão / Comunicação / Argumentação",
    "leitura": "Leitura / Escuta / Fluência / Compreensão",
    "producao_textual": "Produção textual",
    "gramatica": "Gramática",
    "ortografia": "Ortografia",
    "participacao": "Participação",
    "atividade1": "Atividade avaliativa 1",
    "atividade2": "Atividade avaliativa 2",
}

AVALIACOES_INTEGRADAS = {
    "integrada1": "Avaliação integrada 1",
    "integrada2": "Avaliação integrada 2",
}

TODAS_ATIVIDADES = {**ATIVIDADES_PRINCIPAIS, **AVALIACOES_INTEGRADAS}

MEDIAS = {
    "media_total": "Média total",
    "media_integrada": "Média avaliação integrada",
    "media_final_integrada": "Média final integrada",
    "media_trimestral": "Média trimestral",
}


def data_de_hoje():
    """Data local no formato brasileiro."""
    return date.today().strftime("%d/%m/%Y")


def interpretar_nota(texto):
    """Converte o texto digitado em número entre 0 e NOTA_MAXIMA, ou None se estiver vazio/inválido."""
    texto = str(texto if texto is not None else "").strip().replace(",", ".")

    if not texto:
        return None

    try:
        valor = float(texto)
    except ValueError:
        return None

    if not math.isfinite(valor):
        return None

    return min(NOTA_MAXIMA, max(0.0, valor))


def formatar_nota(valor):
    """Nota com vírgula decimal e sem zeros sobrando: 4.5 -> '4,5', 6.0 -> '6'."""
    if valor is None:
        return ""

    return f"{valor:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def normalizar_nota(texto):
    return formatar_nota(interpretar_nota(texto))


def formatar_media(valor):
    """Média sempre com duas casas e vírgula decimal: 4.5 -> '4,50'."""
    if valor is None:
        return ""

    return f"{valor:.2f}".replace(".", ",")


def media(valores):
    """Média dos valores preenchidos. Campos vazios (None) são ignorados, não contam como zero."""
    validos = [valor for valor in valores if valor is not None]

    if not validos:
        return None

    return sum(validos) / len(validos)


def calcular_medias(notas):
    media_total = media(interpretar_nota(notas.get(chave)) for chave in ATIVIDADES_PRINCIPAIS)
    media_integrada = media(interpretar_nota(notas.get(chave)) for chave in AVALIACOES_INTEGRADAS)

    # A média final integrada combina o desempenho principal com as avaliações integradas.
    media_final_integrada = media([media_total, media_integrada])

    # A média trimestral usa a média total e a média final integrada como resultado do período.
    # Com tudo preenchido, isso equivale a 75% da média total + 25% da média integrada.
    media_trimestral = media([media_total, media_final_integrada])

    return {
        "media_total": media_total,
        "media_integrada": media_integrada,
        "media_final_integrada": media_final_integrada,
        "media_trimestral": media_trimestral,
    }


def faixa(valor):
    """Classifica a média em 'boa', 'intermediaria' ou 'baixa' ('' quando não há média)."""
    if valor is None:
        return ""

    if valor >= LIMITE_BOA:
        return "boa"

    if valor >= LIMITE_INTERMEDIARIA:
        return "intermediaria"

    return "baixa"


def novo_aluno():
    return {"nome": "", "notas": {chave: "" for chave in TODAS_ATIVIDADES}}


def normalizar_aluno(dados):
    aluno = novo_aluno()

    if not isinstance(dados, dict):
        return aluno

    notas = dados.get("notas")
    notas = notas if isinstance(notas, dict) else {}
    aluno["nome"] = str(dados.get("nome") or "")

    for chave in TODAS_ATIVIDADES:
        aluno["notas"][chave] = normalizar_nota(notas.get(chave))

    return aluno


def salvar(caminho, cabecalho, alunos):
    dados = {
        "cabecalho": {chave: str(cabecalho.get(chave) or "") for chave in CAMPOS_CABECALHO},
        "alunos": [normalizar_aluno(aluno) for aluno in alunos],
    }

    with open(caminho, "w", encoding="utf-8") as arquivo:
        json.dump(dados, arquivo, ensure_ascii=False, indent=2)


def carregar(caminho):
    """Lê um arquivo salvo e devolve (cabecalho, alunos). Levanta ValueError se o conteúdo for inválido."""
    with open(caminho, encoding="utf-8") as arquivo:
        dados = json.load(arquivo)

    if not isinstance(dados, dict):
        raise ValueError("O arquivo não contém um lançamento de notas.")

    cabecalho_salvo = dados.get("cabecalho")
    cabecalho_salvo = cabecalho_salvo if isinstance(cabecalho_salvo, dict) else {}
    alunos_salvos = dados.get("alunos")
    alunos_salvos = alunos_salvos if isinstance(alunos_salvos, list) else []

    cabecalho = {chave: str(cabecalho_salvo.get(chave) or "") for chave in CAMPOS_CABECALHO}
    alunos = [normalizar_aluno(aluno) for aluno in alunos_salvos]

    return cabecalho, alunos


def linha_do_aluno(numero, aluno):
    """Valores do aluno já formatados, na mesma ordem das colunas da tabela."""
    medias = calcular_medias(aluno["notas"])

    return [
        str(numero),
        aluno["nome"],
        *(normalizar_nota(aluno["notas"].get(chave)) for chave in ATIVIDADES_PRINCIPAIS),
        formatar_media(medias["media_total"]),
        *(normalizar_nota(aluno["notas"].get(chave)) for chave in AVALIACOES_INTEGRADAS),
        formatar_media(medias["media_integrada"]),
        formatar_media(medias["media_final_integrada"]),
        formatar_media(medias["media_trimestral"]),
    ]


def titulos_das_colunas():
    return [
        "Nº",
        "Nome do aluno",
        *ATIVIDADES_PRINCIPAIS.values(),
        MEDIAS["media_total"],
        *AVALIACOES_INTEGRADAS.values(),
        MEDIAS["media_integrada"],
        MEDIAS["media_final_integrada"],
        MEDIAS["media_trimestral"],
    ]


def exportar_csv(caminho, cabecalho, alunos):
    # Ponto e vírgula e BOM para o Excel em português abrir direto, com vírgula decimal.
    with open(caminho, "w", encoding="utf-8-sig", newline="") as arquivo:
        escritor = csv.writer(arquivo, delimiter=";")

        for chave, rotulo in CAMPOS_CABECALHO.items():
            escritor.writerow([rotulo, cabecalho.get(chave, "")])

        escritor.writerow([])
        escritor.writerow(titulos_das_colunas())

        for numero, aluno in enumerate(alunos, start=1):
            escritor.writerow(linha_do_aluno(numero, aluno))


def gerar_html(cabecalho, alunos):
    """Página pronta para imprimir ou salvar como PDF pelo navegador."""
    texto = html.escape
    # Posição das colunas de média dentro de linha_do_aluno, com a chave usada para colorir.
    colunas_de_media = {10: "media_total", 13: "media_integrada", 14: "media_final_integrada", 15: "media_trimestral"}

    dados_turma = "".join(
        f"<div><span>{texto(rotulo)}</span>{texto(cabecalho.get(chave, ''))}</div>"
        for chave, rotulo in CAMPOS_CABECALHO.items()
    )
    titulos_principais = "".join(f"<th>{texto(rotulo)}</th>" for rotulo in ATIVIDADES_PRINCIPAIS.values())
    titulos_integradas = "".join(f"<th>{texto(rotulo)}</th>" for rotulo in AVALIACOES_INTEGRADAS.values())

    linhas = []

    for numero, aluno in enumerate(alunos, start=1):
        medias = calcular_medias(aluno["notas"])
        celulas = []

        for coluna, valor in enumerate(linha_do_aluno(numero, aluno)):
            classe = ""

            if coluna in colunas_de_media:
                classe = f"media {faixa(medias[colunas_de_media[coluna]])}".strip()
            elif coluna == 1:
                classe = "nome"

            celulas.append(f'<td class="{classe}">{texto(valor)}</td>')

        linhas.append(f"<tr>{''.join(celulas)}</tr>")

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Lançamento de Notas Escolares</title>
<style>
  @page {{ size: A4 landscape; margin: 10mm; }}
  * {{ box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }}
  body {{ margin: 16px; color: #1e293b; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }}
  h1 {{ margin: 0 0 10px; padding-bottom: 6px; border-bottom: 3px solid #1d4ed8; font-size: 18px; }}
  .turma {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 16px; margin-bottom: 12px; }}
  .turma span {{ display: block; color: #64748b; font-size: 9px; font-weight: 700; text-transform: uppercase; }}
  table {{ width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }}
  th, td {{ border: 1px solid #94a3b8; padding: 3px; text-align: center; vertical-align: middle; }}
  th {{ background: #dbeafe; }}
  th.integradas {{ background: #ede9fe; }}
  th.calculada {{ background: #e2e8f0; }}
  .numero {{ width: 28px; }}
  .aluno {{ width: 150px; }}
  td.nome {{ text-align: left; }}
  td.media {{ font-weight: 800; }}
  .boa {{ background: #dcfce7; color: #15803d; }}
  .intermediaria {{ background: #fef3c7; color: #a16207; }}
  .baixa {{ background: #fee2e2; color: #b91c1c; }}
</style>
</head>
<body>
<h1>Lançamento de Notas Escolares</h1>
<div class="turma">{dados_turma}</div>
<table>
  <thead>
    <tr>
      <th rowspan="2" class="numero">Nº</th>
      <th rowspan="2" class="aluno">Nome do aluno</th>
      <th colspan="{len(ATIVIDADES_PRINCIPAIS)}">Atividades principais</th>
      <th rowspan="2" class="calculada">{texto(MEDIAS["media_total"])}</th>
      <th colspan="{len(AVALIACOES_INTEGRADAS)}" class="integradas">Avaliações integradas</th>
      <th rowspan="2" class="calculada">{texto(MEDIAS["media_integrada"])}</th>
      <th rowspan="2" class="calculada">{texto(MEDIAS["media_final_integrada"])}</th>
      <th rowspan="2" class="calculada">{texto(MEDIAS["media_trimestral"])}</th>
    </tr>
    <tr>{titulos_principais}{titulos_integradas}</tr>
  </thead>
  <tbody>
    {''.join(linhas)}
  </tbody>
</table>
<script>window.print();</script>
</body>
</html>
"""
