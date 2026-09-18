#!/usr/bin/env python3
"""Documento técnico: modelos, tempo medido, custo e máquina necessária."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, KeepTogether)

SAIDA = "relatorios/modelos-tempo-custo.pdf"

INK    = colors.HexColor("#071B3D")
MUTE   = colors.HexColor("#5B6B85")
RULE   = colors.HexColor("#DFE7F1")
SIGNAL = colors.HexColor("#A8460A")
CALM   = colors.HexColor("#2563EB")
TINT   = colors.HexColor("#EDF2F9")
VERDE  = colors.HexColor("#1B6B4A")

def st(n, **kw):
    b = dict(fontName="Helvetica", fontSize=9.5, leading=14, textColor=INK, alignment=TA_LEFT)
    b.update(kw); return ParagraphStyle(n, **b)

S = {
    "titulo": st("t", fontName="Helvetica-Bold", fontSize=20, leading=23),
    "sub":    st("s", fontSize=10, textColor=MUTE, leading=15),
    "h2":     st("h2", fontName="Helvetica-Bold", fontSize=13, leading=17, spaceBefore=15, spaceAfter=6),
    "h3":     st("h3", fontName="Helvetica-Bold", fontSize=10, leading=13, spaceBefore=8, spaceAfter=3),
    "corpo":  st("c", leading=15),
    "mute":   st("m", fontSize=9, textColor=MUTE, leading=13.5),
    "cel":    st("cel", fontSize=8.5, leading=12),
    "celm":   st("celm", fontSize=8.5, leading=12, textColor=MUTE),
    "celb":   st("celb", fontSize=8.5, leading=12, fontName="Helvetica-Bold"),
    "th":     st("th", fontSize=8, leading=11, fontName="Helvetica-Bold", textColor=MUTE),
}

LARG = A4[0] - 40*mm

def rodape(c, d):
    c.saveState()
    c.setStrokeColor(RULE); c.setLineWidth(0.5)
    c.line(20*mm, 14*mm, A4[0]-20*mm, 14*mm)
    c.setFont("Helvetica", 7.5); c.setFillColor(MUTE)
    c.drawString(20*mm, 9.5*mm, "Medições feitas em Apple M4 / 16 GB, sobre uma gravação de 3h07 (1920x1080)")
    c.drawRightString(A4[0]-20*mm, 9.5*mm, str(d.page))
    c.restoreState()

doc = BaseDocTemplate(SAIDA, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                      topMargin=18*mm, bottomMargin=20*mm,
                      title="Modelos, tempo e custo", author="Integridade — Lector")
doc.addPageTemplates([PageTemplate(id="p",
    frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height)], onPage=rodape)])

h = []
P_ = lambda txt, s="corpo": Paragraph(txt, S[s])

def tabela(cab, linhas, larguras, destaque=None):
    dados = [[Paragraph(c, S["th"]) for c in cab]]
    for ln in linhas:
        dados.append([Paragraph(str(c), S[e]) for c, e in ln])
    t = Table(dados, colWidths=larguras, repeatRows=1)
    estilo = [
        ("LINEBELOW", (0,0), (-1,0), 0.6, RULE),
        ("LINEBELOW", (0,1), (-1,-2), 0.3, RULE),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]
    if destaque is not None:
        estilo.append(("BACKGROUND", (0,destaque), (-1,destaque), TINT))
    t.setStyle(TableStyle(estilo))
    return t

h.append(P_("Modelos, tempo e custo", "titulo"))
h.append(Spacer(1, 4))
h.append(P_("Plataforma de análise de integridade de avaliações — o que roda, "
            "quanto demora, quanto custa e em que máquina.", "sub"))

# ── Modelos ──
h.append(P_("Os modelos", "h2"))
h.append(P_("Quatro modelos. Três rodam na própria máquina, sem rede e sem custo por uso. "
            "Só a classificação de tela depende de API.", "mute"))
h.append(Spacer(1, 8))
h.append(tabela(
    ["Modelo", "Função", "Tamanho", "Licença", "Onde roda"],
    [
        [("gemini-3.1-flash-lite", "celb"), ("Identifica o que está na tela nos desvios", "cel"),
         ("—", "celm"), ("API Google", "celm"), ("Nuvem", "celm")],
        [("silero_vad.onnx", "celb"), ("Detecta presença de voz humana", "cel"),
         ("2,2 MB", "celm"), ("MIT", "celm"), ("Local", "cel")],
        [("yunet.onnx", "celb"), ("Detecta rostos, contagem e orientação da cabeça", "cel"),
         ("0,2 MB", "celm"), ("Apache-2.0", "celm"), ("Local", "cel")],
        [("yolox.onnx", "celb"), ("Detecta objetos na região da câmera", "cel"),
         ("34,2 MB", "celm"), ("Apache-2.0", "celm"), ("Local", "cel")],
    ], [36*mm, 58*mm, 18*mm, 22*mm, 16*mm]))
h.append(Spacer(1, 5))
h.append(P_("Os três modelos locais somam <b>36,6 MB</b> e ficam versionados junto do projeto. "
            "Nenhum exige GPU.", "mute"))

# ── Tempo ──
h.append(P_("Tempo medido, gravação de 3h07", "h2"))
h.append(tabela(
    ["Etapa", "O que faz", "Tempo"],
    [
        [("Detecção de cena", "celb"), ("Varre o vídeo e acha as trocas de contexto (1.353 encontradas)", "cel"), ("63 s", "celb")],
        [("Extração de quadros", "celb"), ("220 quadros + recorte da barra de endereço, a 31 ms cada", "cel"), ("14 s", "celb")],
        [("Assinatura da prova", "celb"), ("Compara cada quadro com a tela da avaliação", "cel"), ("20 s", "celb")],
        [("Áudio (Silero)", "celb"), ("Extrai e analisa 3h de áudio", "cel"), ("51 s", "celb")],
        [("Câmera (YuNet)", "celb"), ("1.124 amostras a cada 10 s", "cel"), ("79 s", "celb")],
        [("Objetos (YOLOX)", "celb"), ("187 amostras a cada 60 s", "cel"), ("22 s", "celb")],
        [("Fundo virtual", "celb"), ("Compara trechos do fundo ao longo da gravação", "cel"), ("1 s", "celb")],
        [("Corte dos trechos", "celb"), ("Um clipe de evidência por evento", "cel"), ("60 s", "celb")],
        [("<b>Subtotal local</b>", "celb"), ("<b>Tudo acima, sem depender de rede</b>", "celb"), ("<b>≈ 5 min</b>", "celb")],
        [("Modelo de visão", "celb"), ("≈ 125 desvios em 21 lotes, sujeito à fila da API", "cel"), ("≈ 10 min", "celb")],
    ], [34*mm, 92*mm, 24*mm], destaque=9))
h.append(Spacer(1, 6))
h.append(P_("<b>Total aproximado: 15 minutos para uma gravação de 3 horas.</b> "
            "Dois terços do tempo é espera pela API, não processamento. Nas medições "
            "houve respostas 503 da API que multiplicaram esse tempo — o pipeline "
            "tenta de novo com espera crescente.", "corpo"))

# ── Custo ──
h.append(P_("Custo", "h2"))
h.append(P_("Só a classificação de tela tem custo por uso. Áudio, câmera, objetos e "
            "fundo virtual rodam na máquina e custam apenas o tempo de CPU.", "mute"))
h.append(Spacer(1, 8))

h.append(P_("Como a conta é feita", "h3"))
h.append(tabela(
    ["Item", "Quantidade", "Preço", "Subtotal"],
    [
        [("Imagens enviadas", "cel"), ("250 (125 desvios x 2 imagens)", "celm"),
         ("1.120 tokens cada", "celm"), ("280.000 tokens", "celb")],
        [("Instrução e prompt", "cel"), ("21 lotes", "celm"),
         ("~600 tokens cada", "celm"), ("12.600 tokens", "celb")],
        [("Entrada total", "celb"), ("292.600 tokens", "celm"),
         ("US$ 0,25 / milhao", "celm"), ("US$ 0,073", "celb")],
        [("Saída (JSON)", "cel"), ("~180 tokens por quadro", "celm"),
         ("US$ 1,50 / milhao", "celm"), ("US$ 0,034", "celb")],
    ], [34*mm, 44*mm, 34*mm, 38*mm]))
h.append(Spacer(1, 8))

caixa = Table([[Paragraph(
    "<b>≈ US$ 0,11 por gravação de 3 horas</b> — cerca de R$ 0,60. "
    "Mil gravações custariam algo em torno de US$ 110.", S["corpo"])]], colWidths=[LARG])
caixa.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), TINT),
    ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
]))
h.append(caixa)
h.append(Spacer(1, 7))
h.append(P_("A assinatura da tela da prova derruba esse valor. Sem ela, os 220 quadros "
            "amostrados iriam todos para a API e o custo subiria para cerca de "
            "<b>US$ 0,18</b> — a filtragem economiza aproximadamente 40%.", "corpo"))
h.append(Spacer(1, 5))
h.append(P_("Preços do Gemini 3.1 Flash-Lite consultados em setembro de 2026: US$ 0,25 por "
            "milhao de tokens de entrada, US$ 1,50 de saída, 1.120 tokens por imagem. "
            "É um cálculo, não uma fatura — o valor real depende do tamanho das imagens "
            "e deve ser conferido no painel de faturamento.", "mute"))

# ── Máquina ──
h.append(P_("Máquina necessária", "h2"))
h.append(P_("Medições feitas em <b>Apple M4, 10 núcleos, 16 GB de RAM</b>, macOS 26.4. "
            "Nada aqui usa GPU: todos os modelos rodam em CPU pelo onnxruntime.", "corpo"))
h.append(Spacer(1, 8))

h.append(tabela(
    ["Recurso", "Mínimo", "Confortável", "Por quê"],
    [
        [("Núcleos", "celb"), ("4", "cel"), ("8 ou mais", "cel"),
         ("ffmpeg e onnxruntime paralelizam; menos núcleos aumentam o tempo proporcionalmente", "celm")],
        [("RAM", "celb"), ("8 GB", "cel"), ("16 GB", "cel"),
         ("3h de áudio ocupam 659 MB em memória de uma vez; com o Node em volta, o pico fica perto de 2 GB", "celm")],
        [("Disco", "celb"), ("50 GB", "cel"), ("200 GB", "cel"),
         ("37 MB de modelos, 16 MB de saída por análise de 3h, mais as gravações de origem (800 MB cada)", "celm")],
        [("GPU", "celb"), ("nenhuma", "cel"), ("nenhuma", "cel"),
         ("Os quatro modelos foram escolhidos para rodar em CPU", "celm")],
        [("Rede", "celb"), ("estável", "cel"), ("estável", "cel"),
         ("Só para a API de visão; o resto é offline", "celm")],
    ], [20*mm, 20*mm, 24*mm, 86*mm]))
h.append(Spacer(1, 8))

h.append(P_("O que instalar", "h3"))
h.append(P_("<b>ffmpeg</b> (com ffprobe), <b>Node.js 22</b> e as dependências do projeto. "
            "Os modelos ficam na pasta <b>modelos/</b>. Nenhum serviço externo além da API "
            "do Gemini.", "corpo"))
h.append(Spacer(1, 6))
h.append(P_("Um Mac mini M4 ou um servidor Linux de 4 vCPU e 8 GB dão conta com folga. "
            "Como o gargalo é espera de rede e não CPU, uma máquina maior não reduz "
            "muito o tempo total.", "corpo"))

# ── Ressalvas ──
h.append(P_("Ressalvas sobre estes números", "h2"))
for item in [
    "As medições vêm de <b>uma máquina e uma gravação</b>. Outra resolução, outro codec "
    "ou um disco mais lento mudam os tempos.",
    "O tempo do modelo de visão é o menos previsível. Nas medições houve respostas 503 "
    "da API que multiplicaram a espera por mais de cinco vezes.",
    "A chave usada é de <b>tier restrito</b>: o gemini-pro-latest respondeu 429 por cota "
    "e o gemini-2.5-flash foi descontinuado durante o desenvolvimento. Volume real pede "
    "chave paga.",
    "O modelo de tela é <b>preview</b>. Modelos preview mudam e saem do ar sem aviso — "
    "é o componente mais frágil da lista.",
    "O consumo de memória do áudio cresce linear com a duração. Uma gravação de 6 horas "
    "ocuparia 1,3 GB de uma vez. Processar em blocos resolveria, e ainda não foi feito.",
]:
    h.append(Paragraph(f"• {item}", S["mute"]))
    h.append(Spacer(1, 5))

doc.build(h)
print("gerado:", SAIDA)
