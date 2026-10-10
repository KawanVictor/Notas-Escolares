import csv
import tempfile
import unittest
from pathlib import Path

import notas


def aluno_com(nome="", **valores):
    aluno = notas.novo_aluno()
    aluno["nome"] = nome
    aluno["notas"].update(valores)

    return aluno


class NotasTest(unittest.TestCase):
    def test_interpreta_virgula_ponto_e_digitacao_incompleta(self):
        self.assertEqual(notas.interpretar_nota("4,5"), 4.5)
        self.assertEqual(notas.interpretar_nota("4.5"), 4.5)
        self.assertEqual(notas.interpretar_nota("4,"), 4.0)
        self.assertEqual(notas.interpretar_nota("0"), 0.0)

    def test_vazio_e_invalido_nao_viram_nota(self):
        for texto in ("", "  ", None, "abc", ",", "nan", "inf"):
            self.assertIsNone(notas.interpretar_nota(texto), texto)

    def test_limita_entre_zero_e_nota_maxima(self):
        self.assertEqual(notas.interpretar_nota("45"), 6.0)
        self.assertEqual(notas.interpretar_nota("-1"), 0.0)

    def test_normaliza_para_virgula_sem_zeros_sobrando(self):
        self.assertEqual(notas.normalizar_nota("4.50"), "4,5")
        self.assertEqual(notas.normalizar_nota("6,0"), "6")
        self.assertEqual(notas.normalizar_nota("0"), "0")
        self.assertEqual(notas.normalizar_nota("3.25"), "3,25")
        self.assertEqual(notas.normalizar_nota(""), "")

    def test_medias_com_tudo_preenchido(self):
        valores = {chave: "4" for chave in notas.ATIVIDADES_PRINCIPAIS}
        valores.update(integrada1="6", integrada2="6")
        medias = notas.calcular_medias(valores)

        self.assertEqual(medias["media_total"], 4.0)
        self.assertEqual(medias["media_integrada"], 6.0)
        self.assertEqual(medias["media_final_integrada"], 5.0)
        # 75% da média total + 25% da média integrada.
        self.assertEqual(medias["media_trimestral"], 4.5)

    def test_campos_vazios_nao_contam_como_zero(self):
        medias = notas.calcular_medias({"oralidade": "6", "leitura": ""})

        self.assertEqual(medias["media_total"], 6.0)
        self.assertIsNone(medias["media_integrada"])
        self.assertEqual(medias["media_final_integrada"], 6.0)
        self.assertEqual(medias["media_trimestral"], 6.0)

    def test_nota_zero_entra_na_media(self):
        medias = notas.calcular_medias({"oralidade": "0", "leitura": "6"})

        self.assertEqual(medias["media_total"], 3.0)

    def test_sem_notas_nao_ha_medias(self):
        self.assertTrue(all(valor is None for valor in notas.calcular_medias({}).values()))

    def test_faixas(self):
        self.assertEqual(notas.faixa(4.5), "boa")
        self.assertEqual(notas.faixa(4.49), "intermediaria")
        self.assertEqual(notas.faixa(3.0), "intermediaria")
        self.assertEqual(notas.faixa(2.99), "baixa")
        self.assertEqual(notas.faixa(0.0), "baixa")
        self.assertEqual(notas.faixa(None), "")

    def test_salvar_e_carregar(self):
        cabecalho = {"escola": "Escola Municipal", "turma": "7º A", "data": "10/10/2026"}
        alunos = [aluno_com("Ana", oralidade="4.5", integrada1="45"), aluno_com("João")]

        with tempfile.TemporaryDirectory() as pasta:
            caminho = Path(pasta) / "turma.json"
            notas.salvar(caminho, cabecalho, alunos)
            cabecalho_lido, alunos_lidos = notas.carregar(caminho)

        self.assertEqual(cabecalho_lido["turma"], "7º A")
        self.assertEqual(cabecalho_lido["professor"], "")
        self.assertEqual([aluno["nome"] for aluno in alunos_lidos], ["Ana", "João"])
        self.assertEqual(alunos_lidos[0]["notas"]["oralidade"], "4,5")
        self.assertEqual(alunos_lidos[0]["notas"]["integrada1"], "6")

    def test_carregar_arquivo_invalido(self):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = Path(pasta) / "ruim.json"
            caminho.write_text("[1, 2, 3]", encoding="utf-8")

            with self.assertRaises(ValueError):
                notas.carregar(caminho)

            caminho.write_text("isto não é json", encoding="utf-8")

            with self.assertRaises(ValueError):
                notas.carregar(caminho)

    def test_csv_usa_virgula_decimal_em_notas_e_medias(self):
        alunos = [aluno_com("Silva; Ana", oralidade="4.5", leitura="0")]

        with tempfile.TemporaryDirectory() as pasta:
            caminho = Path(pasta) / "notas.csv"
            notas.exportar_csv(caminho, {"turma": "7º A"}, alunos)
            conteudo = caminho.read_bytes()

            with open(caminho, encoding="utf-8-sig", newline="") as arquivo:
                linhas = list(csv.reader(arquivo, delimiter=";"))

        self.assertTrue(conteudo.startswith(b"\xef\xbb\xbf"))
        self.assertEqual(linhas[1], ["Turma", "7º A"])
        self.assertEqual(linhas[len(notas.CAMPOS_CABECALHO) + 1], notas.titulos_das_colunas())

        linha_aluno = linhas[-1]
        self.assertEqual(len(linha_aluno), len(notas.titulos_das_colunas()))
        self.assertEqual(linha_aluno[:4], ["1", "Silva; Ana", "4,5", "0"])
        self.assertEqual(linha_aluno[10], "2,25")

    def test_html_escapa_o_que_foi_digitado(self):
        pagina = notas.gerar_html({"escola": "<b>Escola</b>"}, [aluno_com("<script>", oralidade="5")])

        self.assertIn("&lt;b&gt;Escola&lt;/b&gt;", pagina)
        self.assertIn("&lt;script&gt;", pagina)
        self.assertIn('class="media boa">5,00', pagina)


if __name__ == "__main__":
    unittest.main()
