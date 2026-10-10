"""Lançamento de Notas Escolares — interface desktop (Tkinter)."""

import re
import tempfile
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import notas

PASTA_DADOS = Path(__file__).resolve().parent / "dados"
ARQUIVO_ULTIMO = PASTA_DADOS / "ultimo.txt"
TITULO = "Lançamento de Notas Escolares"

COR_FUNDO = "#eef2f5"
COR_FOLHA = "#ffffff"
COR_TEXTO = "#1e293b"
COR_SUAVE = "#64748b"
COR_LINHA = "#cbd5e1"
COR_ZEBRA = "#f8fafc"
COR_AZUL = "#1d4ed8"
COR_AZUL_ESCURO = "#1e40af"
COR_AZUL_CLARO = "#dbeafe"
COR_AZUL_SUBTITULO = "#e0f2fe"
COR_ROXO_CLARO = "#ede9fe"
COR_CALCULADA = "#e2e8f0"
COR_VERMELHO = "#b91c1c"
COR_VERMELHO_CLARO = "#fee2e2"
COR_ALERTA = "#a16207"

# faixa -> (fundo, texto)
CORES_FAIXA = {
    "boa": ("#dcfce7", "#15803d"),
    "intermediaria": ("#fef3c7", "#a16207"),
    "baixa": ("#fee2e2", "#b91c1c"),
}

# estilo -> (fundo, texto, borda, fundo com o mouse em cima)
ESTILOS_BOTAO = {
    "primario": (COR_AZUL, "#ffffff", COR_AZUL, COR_AZUL_ESCURO),
    "secundario": (COR_FOLHA, COR_AZUL, COR_LINHA, COR_AZUL_CLARO),
    "perigo": (COR_FOLHA, COR_VERMELHO, "#fecaca", COR_VERMELHO_CLARO),
}

FONTE = ("Segoe UI", 10)
FONTE_NEGRITO = ("Segoe UI", 10, "bold")
FONTE_PEQUENA = ("Segoe UI", 8, "bold")
FONTE_TITULO = ("Segoe UI", 18, "bold")

# Ordem das colunas: nº, nome, atividades principais, média total,
# avaliações integradas, três médias calculadas e ações.
LARGURA_NUMERO = 44
LARGURA_NOME = 230
LARGURA_NOTA = 108
LARGURA_MEDIA = 92
LARGURA_ACOES = 88
LARGURAS = (
    [LARGURA_NUMERO, LARGURA_NOME]
    + [LARGURA_NOTA] * len(notas.ATIVIDADES_PRINCIPAIS)
    + [LARGURA_MEDIA]
    + [LARGURA_NOTA] * len(notas.AVALIACOES_INTEGRADAS)
    + [LARGURA_MEDIA] * 3
    + [LARGURA_ACOES]
)
COLUNA_MEDIA_TOTAL = 2 + len(notas.ATIVIDADES_PRINCIPAIS)
COLUNA_INTEGRADAS = COLUNA_MEDIA_TOTAL + 1
COLUNA_MEDIAS_FINAIS = COLUNA_INTEGRADAS + len(notas.AVALIACOES_INTEGRADAS)
COLUNA_ACOES = COLUNA_MEDIAS_FINAIS + 3

# Aceita a nota ainda pela metade ("4", "4,", "4,5"), com vírgula ou ponto.
NOTA_EM_DIGITACAO = re.compile(r"\d{0,2}([.,]\d{0,2})?")


class App(tk.Tk):
    def __init__(self):
        super().__init__()

        self.alunos = []
        self.linhas = []
        self.caminho = None
        self.alterado = False

        self.geometry("1320x760")

        try:
            self.state("zoomed")
        except tk.TclError:
            pass  # Nem todo sistema tem janela maximizada por este comando.

        self.minsize(720, 480)
        self.configure(bg=COR_FUNDO)
        self.protocol("WM_DELETE_WINDOW", self.fechar)

        self.validar_nota = (self.register(self._nota_em_digitacao), "%P")
        self.campos = {chave: tk.StringVar() for chave in notas.CAMPOS_CABECALHO}
        self.status = tk.StringVar()

        self._montar_tela()

        for variavel in self.campos.values():
            variavel.trace_add("write", lambda *_: self.marcar_alterado())

        self.bind_all("<MouseWheel>", self._rolar_vertical)
        self.bind_all("<Shift-MouseWheel>", self._rolar_horizontal)
        self.bind_all("<Control-s>", lambda _: self.salvar())
        self.bind_all("<Control-o>", lambda _: self.abrir())
        self.bind_all("<Control-n>", lambda _: self.novo())

        self._abrir_ultimo_arquivo()

    # ----- Montagem da tela -----

    def _montar_tela(self):
        folha = tk.Frame(self, bg=COR_FOLHA, highlightbackground=COR_LINHA, highlightthickness=1)
        folha.pack(fill="both", expand=True, padx=16, pady=16)

        topo = tk.Frame(folha, bg=COR_ZEBRA)
        topo.pack(fill="x")
        tk.Label(
            topo, text="SISTEMA LOCAL DE LANÇAMENTO DE NOTAS", bg=COR_ZEBRA, fg=COR_AZUL, font=FONTE_PEQUENA
        ).pack(anchor="w", padx=20, pady=(14, 0))
        tk.Label(topo, text=TITULO, bg=COR_ZEBRA, fg=COR_TEXTO, font=FONTE_TITULO).pack(anchor="w", padx=20)

        botoes = tk.Frame(topo, bg=COR_ZEBRA)
        botoes.pack(fill="x", padx=20, pady=(10, 16))
        acoes = [
            ("Adicionar aluno", self.adicionar_aluno, "primario"),
            ("Salvar", self.salvar, "primario"),
            ("Abrir", self.abrir, "secundario"),
            ("Salvar como", self.salvar_como, "secundario"),
            ("Exportar CSV", self.exportar_csv, "secundario"),
            ("Imprimir / PDF", self.imprimir, "secundario"),
        ]

        for texto, comando, estilo in acoes:
            self._criar_botao(botoes, texto, comando, estilo).pack(side="left", padx=(0, 8))

        self._criar_botao(botoes, "Novo lançamento", self.novo, "perigo").pack(side="right")

        tk.Frame(folha, bg=COR_AZUL, height=3).pack(fill="x")

        dados_turma = tk.Frame(folha, bg=COR_FOLHA)
        dados_turma.pack(fill="x", padx=(20, 8), pady=(14, 10))

        for posicao, (chave, rotulo) in enumerate(notas.CAMPOS_CABECALHO.items()):
            linha, coluna = divmod(posicao, 4)
            dados_turma.grid_columnconfigure(coluna, weight=1, uniform="campos")
            campo = tk.Frame(dados_turma, bg=COR_FOLHA)
            campo.grid(row=linha, column=coluna, sticky="ew", padx=(0, 12), pady=5)
            tk.Label(campo, text=rotulo.upper(), bg=COR_FOLHA, fg=COR_SUAVE, font=FONTE_PEQUENA).pack(
                anchor="w", pady=(0, 2)
            )
            tk.Entry(
                campo,
                textvariable=self.campos[chave],
                font=FONTE,
                fg=COR_TEXTO,
                bg=COR_FOLHA,
                relief="flat",
                bd=6,
                highlightthickness=1,
                highlightbackground=COR_LINHA,
                highlightcolor=COR_AZUL,
            ).pack(fill="x")

        barra_status = tk.Frame(folha, bg=COR_FOLHA)
        barra_status.pack(fill="x", padx=20, pady=(0, 10))
        self.rotulo_status = tk.Label(barra_status, textvariable=self.status, bg=COR_FOLHA, fg=COR_SUAVE, font=FONTE)
        self.rotulo_status.pack(side="left")

        for texto, nome_faixa in (("Baixa", "baixa"), ("Intermediária", "intermediaria"), ("Boa", "boa")):
            fundo, cor = CORES_FAIXA[nome_faixa]
            tk.Label(barra_status, text=texto, bg=fundo, fg=cor, font=FONTE_PEQUENA, padx=10, pady=4).pack(
                side="right", padx=(8, 0)
            )

        self._montar_tabela(folha)

    def _criar_botao(self, pai, texto, comando, estilo, fonte=FONTE_NEGRITO, margem=(14, 5)):
        fundo, cor, borda, realce = ESTILOS_BOTAO[estilo]
        # O quadro em volta faz o papel da borda de 1 px, que o botão do Tk não desenha no Windows.
        moldura = tk.Frame(pai, bg=borda)
        botao = tk.Button(
            moldura,
            text=texto,
            command=comando,
            font=fonte,
            bg=fundo,
            fg=cor,
            activebackground=realce,
            activeforeground=cor,
            relief="flat",
            bd=0,
            cursor="hand2",
            padx=margem[0],
            pady=margem[1],
        )
        botao.pack(padx=1, pady=1)
        botao.bind("<Enter>", lambda _: botao.configure(bg=realce))
        botao.bind("<Leave>", lambda _: botao.configure(bg=fundo))

        return moldura

    def _montar_tabela(self, pai):
        area = tk.Frame(pai, bg=COR_FOLHA)
        area.pack(fill="both", expand=True, padx=20, pady=(0, 20))
        area.grid_rowconfigure(1, weight=1)
        area.grid_columnconfigure(0, weight=1)

        # O cabeçalho fica em um canvas próprio para continuar visível na rolagem vertical;
        # a rolagem horizontal move os dois juntos.
        self.canvas_titulos = tk.Canvas(area, bg=COR_FOLHA, highlightthickness=0)
        self.canvas_titulos.grid(row=0, column=0, sticky="ew")
        self.canvas_corpo = tk.Canvas(area, bg=COR_FOLHA, highlightthickness=0)
        self.canvas_corpo.grid(row=1, column=0, sticky="nsew")

        barra_vertical = ttk.Scrollbar(area, orient="vertical", command=self.canvas_corpo.yview)
        barra_vertical.grid(row=1, column=1, sticky="ns")
        barra_horizontal = ttk.Scrollbar(area, orient="horizontal", command=self._mover_horizontal)
        barra_horizontal.grid(row=2, column=0, sticky="ew")
        self.canvas_corpo.configure(yscrollcommand=barra_vertical.set, xscrollcommand=barra_horizontal.set)

        quadro_titulos = tk.Frame(self.canvas_titulos, bg=COR_LINHA, padx=1, pady=1)
        self.quadro_corpo = tk.Frame(self.canvas_corpo, bg=COR_LINHA, padx=1)
        self.canvas_titulos.create_window(0, 0, window=quadro_titulos, anchor="nw")
        self.canvas_corpo.create_window(0, 0, window=self.quadro_corpo, anchor="nw")

        for coluna, largura in enumerate(LARGURAS):
            quadro_titulos.grid_columnconfigure(coluna, minsize=largura)
            self.quadro_corpo.grid_columnconfigure(coluna, minsize=largura)

        self._montar_titulos(quadro_titulos)

        quadro_titulos.update_idletasks()
        self.largura_tabela = quadro_titulos.winfo_reqwidth()
        altura = quadro_titulos.winfo_reqheight()
        self.canvas_titulos.configure(height=altura, scrollregion=(0, 0, self.largura_tabela, altura))
        self.quadro_corpo.bind(
            "<Configure>",
            lambda evento: self.canvas_corpo.configure(scrollregion=(0, 0, self.largura_tabela, evento.height)),
        )

    def _montar_titulos(self, quadro):
        def titulo(texto, linha, coluna, cor, linhas=1, colunas=1):
            largura = sum(LARGURAS[coluna:coluna + colunas])
            tk.Label(
                quadro,
                text=texto,
                bg=cor,
                fg="#0f172a",
                font=FONTE_PEQUENA,
                wraplength=largura - 14,
                bd=0,
                padx=2,
                pady=7,
            ).grid(row=linha, column=coluna, rowspan=linhas, columnspan=colunas, sticky="nsew", padx=(0, 1), pady=(0, 1))

        titulo("Nº", 0, 0, COR_AZUL_CLARO, linhas=2)
        titulo("Nome do aluno", 0, 1, COR_AZUL_CLARO, linhas=2)
        titulo("Atividades principais", 0, 2, COR_AZUL_CLARO, colunas=len(notas.ATIVIDADES_PRINCIPAIS))
        titulo(notas.MEDIAS["media_total"], 0, COLUNA_MEDIA_TOTAL, COR_CALCULADA, linhas=2)
        titulo(
            "Avaliações integradas", 0, COLUNA_INTEGRADAS, COR_ROXO_CLARO, colunas=len(notas.AVALIACOES_INTEGRADAS)
        )

        for posicao, chave in enumerate(("media_integrada", "media_final_integrada", "media_trimestral")):
            titulo(notas.MEDIAS[chave], 0, COLUNA_MEDIAS_FINAIS + posicao, COR_CALCULADA, linhas=2)

        titulo("Ações", 0, COLUNA_ACOES, COR_AZUL_CLARO, linhas=2)

        for posicao, rotulo in enumerate(notas.ATIVIDADES_PRINCIPAIS.values()):
            titulo(rotulo, 1, 2 + posicao, COR_AZUL_SUBTITULO)

        for posicao, rotulo in enumerate(notas.AVALIACOES_INTEGRADAS.values()):
            titulo(rotulo, 1, COLUNA_INTEGRADAS + posicao, COR_AZUL_SUBTITULO)

    # ----- Tabela de alunos -----

    def desenhar_tabela(self):
        for elemento in self.quadro_corpo.winfo_children():
            elemento.destroy()

        self.linhas = []

        if not self.alunos:
            tk.Label(
                self.quadro_corpo, text="Nenhum aluno adicionado.", bg=COR_FOLHA, fg=COR_SUAVE, font=FONTE, pady=14
            ).grid(row=0, column=0, columnspan=len(LARGURAS), sticky="nsew", padx=(0, 1), pady=(0, 1))
            return

        for indice, aluno in enumerate(self.alunos):
            self._desenhar_linha(indice, aluno)

    def _desenhar_linha(self, indice, aluno):
        fundo = COR_ZEBRA if indice % 2 else COR_FOLHA
        borda = {"sticky": "nsew", "padx": (0, 1), "pady": (0, 1)}
        linha = {"aluno": aluno, "fundo": fundo, "entradas": {}, "medias": {}}

        tk.Label(self.quadro_corpo, text=indice + 1, bg=fundo, fg=COR_TEXTO, font=FONTE_NEGRITO).grid(
            row=indice, column=0, **borda
        )

        nome = tk.StringVar(value=aluno["nome"])
        nome.trace_add("write", lambda *_: self._nome_alterado(aluno, nome))
        # A borda do campo tem a cor do fundo e só aparece (em azul) quando ele está em foco.
        campo = {
            "width": 1,
            "font": FONTE,
            "fg": COR_TEXTO,
            "bg": fundo,
            "relief": "flat",
            "bd": 6,
            "highlightthickness": 1,
            "highlightbackground": fundo,
            "highlightcolor": COR_AZUL,
        }
        linha["nome"] = tk.Entry(self.quadro_corpo, textvariable=nome, **campo)
        linha["nome"].grid(row=indice, column=1, **borda)

        colunas_de_nota = [
            *((chave, 2 + posicao) for posicao, chave in enumerate(notas.ATIVIDADES_PRINCIPAIS)),
            *((chave, COLUNA_INTEGRADAS + posicao) for posicao, chave in enumerate(notas.AVALIACOES_INTEGRADAS)),
        ]

        for chave, coluna in colunas_de_nota:
            variavel = tk.StringVar(value=aluno["notas"][chave])
            entrada = tk.Entry(
                self.quadro_corpo,
                textvariable=variavel,
                justify="center",
                validate="key",
                validatecommand=self.validar_nota,
                **campo,
            )
            entrada.grid(row=indice, column=coluna, **borda)
            variavel.trace_add(
                "write", lambda *_, chave=chave, variavel=variavel: self._nota_alterada(linha, chave, variavel)
            )
            # A nota só é arrumada ao sair do campo, para não atrapalhar a digitação de decimais.
            entrada.bind("<FocusOut>", lambda _, variavel=variavel: self._arrumar_nota(variavel))
            entrada.bind("<Return>", lambda _, chave=chave, variavel=variavel: self._descer(linha, chave, variavel))
            linha["entradas"][chave] = entrada

        colunas_de_media = {
            "media_total": COLUNA_MEDIA_TOTAL,
            "media_integrada": COLUNA_MEDIAS_FINAIS,
            "media_final_integrada": COLUNA_MEDIAS_FINAIS + 1,
            "media_trimestral": COLUNA_MEDIAS_FINAIS + 2,
        }

        for chave, coluna in colunas_de_media.items():
            rotulo = tk.Label(self.quadro_corpo, font=FONTE_NEGRITO)
            rotulo.grid(row=indice, column=coluna, **borda)
            linha["medias"][chave] = rotulo

        celula_acoes = tk.Frame(self.quadro_corpo, bg=fundo)
        celula_acoes.grid(row=indice, column=COLUNA_ACOES, **borda)
        self._criar_botao(
            celula_acoes, "Remover", lambda: self.remover_aluno(aluno), "perigo", fonte=FONTE_PEQUENA, margem=(8, 2)
        ).pack(expand=True)

        self.linhas.append(linha)
        self._atualizar_medias(linha)

    def _atualizar_medias(self, linha):
        medias = notas.calcular_medias(linha["aluno"]["notas"])

        for chave, rotulo in linha["medias"].items():
            fundo, cor = CORES_FAIXA.get(notas.faixa(medias[chave]), (linha["fundo"], COR_TEXTO))
            rotulo.configure(text=notas.formatar_media(medias[chave]), bg=fundo, fg=cor)

    def _nota_em_digitacao(self, texto):
        return NOTA_EM_DIGITACAO.fullmatch(texto) is not None

    def _nome_alterado(self, aluno, variavel):
        aluno["nome"] = variavel.get()
        self.marcar_alterado()

    def _nota_alterada(self, linha, chave, variavel):
        linha["aluno"]["notas"][chave] = variavel.get()
        self._atualizar_medias(linha)
        self.marcar_alterado()

    def _arrumar_nota(self, variavel):
        arrumada = notas.normalizar_nota(variavel.get())

        if arrumada != variavel.get():
            variavel.set(arrumada)

    def _descer(self, linha, chave, variavel):
        """Enter confirma a nota e vai para o mesmo campo do próximo aluno."""
        self._arrumar_nota(variavel)
        proxima = self.linhas.index(linha) + 1

        if proxima < len(self.linhas):
            entrada = self.linhas[proxima]["entradas"][chave]
            entrada.focus_set()
            entrada.select_range(0, "end")

    def adicionar_aluno(self):
        self.alunos.append(notas.novo_aluno())

        if len(self.alunos) == 1:
            self.desenhar_tabela()
        else:
            self._desenhar_linha(len(self.alunos) - 1, self.alunos[-1])

        # Leva a tabela até a linha nova e já deixa o cursor no nome.
        self.update_idletasks()
        self.canvas_corpo.configure(scrollregion=(0, 0, self.largura_tabela, self.quadro_corpo.winfo_reqheight()))
        self.canvas_corpo.yview_moveto(1)
        self.linhas[-1]["nome"].focus_set()
        self.marcar_alterado()

    def remover_aluno(self, aluno):
        if not messagebox.askyesno(TITULO, f"Remover {aluno['nome'] or 'este aluno'}?", parent=self):
            return

        # Compara por identidade: dois alunos em branco são iguais como dicionários.
        self.alunos = [item for item in self.alunos if item is not aluno]
        self.desenhar_tabela()
        self.marcar_alterado()

    # ----- Rolagem -----

    def _mover_horizontal(self, *argumentos):
        self.canvas_titulos.xview(*argumentos)
        self.canvas_corpo.xview(*argumentos)

    def _rolar_vertical(self, evento):
        if self.canvas_corpo.yview() != (0.0, 1.0):
            self.canvas_corpo.yview_scroll(-evento.delta // 120, "units")

    def _rolar_horizontal(self, evento):
        if self.canvas_corpo.xview() != (0.0, 1.0):
            self._mover_horizontal("scroll", -evento.delta // 120, "units")

    # ----- Estado e arquivos -----

    def _cabecalho(self):
        return {chave: variavel.get().strip() for chave, variavel in self.campos.items()}

    def _aplicar(self, cabecalho, alunos, caminho):
        for chave, variavel in self.campos.items():
            variavel.set(cabecalho.get(chave, ""))

        if not self.campos["data"].get():
            self.campos["data"].set(notas.data_de_hoje())

        self.alunos = alunos or [notas.novo_aluno()]
        self.caminho = caminho
        self.desenhar_tabela()
        self.canvas_corpo.yview_moveto(0)
        self.alterado = False
        self._atualizar_titulo()

    def _atualizar_titulo(self):
        nome = self.caminho.name if self.caminho else "Sem título"
        self.title(f"{'*' if self.alterado else ''}{nome} — {TITULO}")
        self.rotulo_status.configure(fg=COR_ALERTA if self.alterado else COR_SUAVE)

    def marcar_alterado(self):
        self.status.set("Há alterações ainda não salvas.")

        if not self.alterado:
            self.alterado = True
            self._atualizar_titulo()

    def _confirmar_descarte(self):
        """Pergunta o que fazer com alterações não salvas. Devolve False se a ação deve ser cancelada."""
        if not self.alterado:
            return True

        resposta = messagebox.askyesnocancel(TITULO, "Há alterações não salvas. Deseja salvar antes?", parent=self)

        if resposta is None:
            return False

        return self.salvar() if resposta else True

    def _nome_sugerido(self):
        cabecalho = self._cabecalho()
        partes = [cabecalho[chave] for chave in ("turma", "disciplina", "trimestre") if cabecalho[chave]]
        nome = re.sub(r'[\\/:*?"<>|]+', "", " - ".join(partes)).strip()

        return nome or "lancamento-notas"

    def _abrir_ultimo_arquivo(self):
        try:
            caminho = Path(ARQUIVO_ULTIMO.read_text(encoding="utf-8").strip())
            cabecalho, alunos = notas.carregar(caminho)
        except (OSError, ValueError):
            self._aplicar({}, [], None)
            self.status.set("Nenhum lançamento aberto. Uma linha inicial foi criada.")
            return

        self._aplicar(cabecalho, alunos, caminho)
        self.status.set(f"Dados carregados de {caminho.name}.")

    def _lembrar_arquivo(self, caminho):
        try:
            PASTA_DADOS.mkdir(exist_ok=True)
            ARQUIVO_ULTIMO.write_text(str(caminho), encoding="utf-8")
        except OSError:
            pass

    def novo(self):
        if not self._confirmar_descarte():
            return

        self._aplicar({}, [], None)
        self.status.set("Novo lançamento em branco.")

    def abrir(self):
        if not self._confirmar_descarte():
            return

        PASTA_DADOS.mkdir(exist_ok=True)
        escolhido = filedialog.askopenfilename(
            parent=self, initialdir=PASTA_DADOS, filetypes=[("Lançamento de notas", "*.json")]
        )

        if not escolhido:
            return

        caminho = Path(escolhido)

        try:
            cabecalho, alunos = notas.carregar(caminho)
        except (OSError, ValueError) as erro:
            messagebox.showerror(TITULO, f"Não foi possível abrir o arquivo.\n\n{erro}", parent=self)
            return

        self._aplicar(cabecalho, alunos, caminho)
        self._lembrar_arquivo(caminho)
        self.status.set(f"Dados carregados de {caminho.name}.")

    def salvar(self):
        """Salva no arquivo atual (ou pergunta onde). Devolve True se salvou."""
        if self.caminho is None:
            return self.salvar_como()

        try:
            notas.salvar(self.caminho, self._cabecalho(), self.alunos)
        except OSError as erro:
            messagebox.showerror(TITULO, f"Não foi possível salvar o arquivo.\n\n{erro}", parent=self)
            return False

        self._lembrar_arquivo(self.caminho)
        self.alterado = False
        self._atualizar_titulo()
        self.status.set(f"Dados salvos em {self.caminho.name}.")

        return True

    def salvar_como(self):
        PASTA_DADOS.mkdir(exist_ok=True)
        escolhido = filedialog.asksaveasfilename(
            parent=self,
            initialdir=PASTA_DADOS,
            initialfile=self._nome_sugerido(),
            defaultextension=".json",
            filetypes=[("Lançamento de notas", "*.json")],
        )

        if not escolhido:
            return False

        self.caminho = Path(escolhido)

        return self.salvar()

    def exportar_csv(self):
        escolhido = filedialog.asksaveasfilename(
            parent=self,
            initialfile=self._nome_sugerido(),
            defaultextension=".csv",
            filetypes=[("Planilha CSV", "*.csv")],
        )

        if not escolhido:
            return

        try:
            notas.exportar_csv(escolhido, self._cabecalho(), self.alunos)
        except OSError as erro:
            messagebox.showerror(TITULO, f"Não foi possível exportar o CSV.\n\n{erro}", parent=self)
            return

        self.status.set(f"Arquivo CSV exportado: {Path(escolhido).name}.")

    def imprimir(self):
        """Abre a planilha no navegador, que cuida da impressão e do 'Salvar como PDF'."""
        pagina = notas.gerar_html(self._cabecalho(), self.alunos)

        try:
            with tempfile.NamedTemporaryFile(
                "w", encoding="utf-8", suffix=".html", prefix="lancamento-notas-", delete=False
            ) as arquivo:
                arquivo.write(pagina)
        except OSError as erro:
            messagebox.showerror(TITULO, f"Não foi possível preparar a impressão.\n\n{erro}", parent=self)
            return

        webbrowser.open(Path(arquivo.name).as_uri())
        self.status.set("Planilha aberta no navegador para imprimir ou salvar em PDF.")

    def fechar(self):
        if self._confirmar_descarte():
            self.destroy()


if __name__ == "__main__":
    App().mainloop()
