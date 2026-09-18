#!/usr/bin/env python3
"""Gera o relatório de integridade em PDF a partir de uma analise.json."""
import json, os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Image, Table, TableStyle, KeepTogether, PageBreak)

BASE = sys.argv[1] if len(sys.argv) > 1 else "public/analises/cigam-israel-castro"
SAIDA = sys.argv[2] if len(sys.argv) > 2 else "relatorios/integridade-israel-castro.pdf"

INK    = colors.HexColor("#071B3D")
MUTE   = colors.HexColor("#5B6B85")
RULE   = colors.HexColor("#DFE7F1")
SIGNAL = colors.HexColor("#A8460A")
FILL   = colors.HexColor("#FF7A1A")
CALM   = colors.HexColor("#2563EB")
TINT   = colors.HexColor("#EDF2F9")

an = json.load(open(os.path.join(BASE, "analise.json"), encoding="utf-8"))

def hhmmss(s):
    s = int(s)
    return f"{s//3600}:{s%3600//60:02d}:{s%60:02d}"

NIVEL = {"alta": "Alta atenção", "revisar": "Revisar",
         "atencao": "Atenção", "informacao": "Informação"}

def st(nome, **kw):
    base = dict(fontName="Helvetica", fontSize=9.5, leading=14,
                textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(nome, **base)

S = {
    "titulo":  st("titulo", fontName="Helvetica-Bold", fontSize=21, leading=24, spaceAfter=2),
    "sub":     st("sub", fontSize=10, textColor=MUTE, leading=15),
    "h2":      st("h2", fontName="Helvetica-Bold", fontSize=13, leading=17,
                  spaceBefore=16, spaceAfter=7),
    "h3":      st("h3", fontName="Helvetica-Bold", fontSize=10.5, leading=14, spaceAfter=3),
    "corpo":   st("corpo", leading=15),
    "mute":    st("mute", fontSize=9, textColor=MUTE, leading=13.5),
    "rotulo":  st("rotulo", fontName="Helvetica-Bold", fontSize=8.5, textColor=MUTE, leading=12),
    "tc":      st("tc", fontName="Helvetica-Bold", fontSize=11, textColor=CALM, leading=14),
    "evtit":   st("evtit", fontName="Helvetica-Bold", fontSize=12, leading=15),
}

LARG = A4[0] - 40*mm

def rodape(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(RULE); canvas.setLineWidth(0.5)
    canvas.line(20*mm, 14*mm, A4[0]-20*mm, 14*mm)
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(MUTE)
    canvas.drawString(20*mm, 9.5*mm, "Relatório de integridade — apoio à revisão humana, não decisão sobre o candidato")
    canvas.drawRightString(A4[0]-20*mm, 9.5*mm, f"{doc.page}")
    canvas.restoreState()

doc = BaseDocTemplate(SAIDA, pagesize=A4,
                      leftMargin=20*mm, rightMargin=20*mm,
                      topMargin=18*mm, bottomMargin=20*mm,
                      title="Relatório de Integridade da Avaliação",
                      author="Integridade — Lector")
doc.addPageTemplates([PageTemplate(id="p",
    frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")],
    onPage=rodape)])

hist = []
av = an.get("avaliacao") or {}
g = an["gravacao"]
m = an["metricas"]

# ── Cabeçalho ──
hist.append(Paragraph("Relatório de Integridade da Avaliação", S["titulo"]))
hist.append(Spacer(1, 7))

ident = [
    ["Candidato", av.get("candidato", "—")],
    ["Avaliação", av.get("prova", "—")],
    ["Instituição", av.get("instituicao", "—")],
    ["Data", av.get("data", "—")],
    ["Duração", hhmmss(g["duracao"])],
    ["Arquivo", g["arquivo"]],
]
t = Table(ident, colWidths=[28*mm, LARG-28*mm])
t.setStyle(TableStyle([
    ("FONT", (0,0), (0,-1), "Helvetica", 9),
    ("FONT", (1,0), (1,-1), "Helvetica-Bold", 9),
    ("TEXTCOLOR", (0,0), (0,-1), MUTE),
    ("TEXTCOLOR", (1,0), (1,-1), INK),
    ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ("TOPPADDING", (0,0), (-1,-1), 3),
    ("LINEBELOW", (0,0), (-1,-2), 0.4, RULE),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
]))
hist.append(t)

# ── Resumo ──
hist.append(Paragraph("Resumo da análise", S["h2"]))
hist.append(Paragraph(an["resumo"], S["corpo"]))
hist.append(Spacer(1, 10))

niveis = [["Alta atenção", "Revisar", "Atenção", "Informação"],
          [str(m["porNivel"]["alta"]), str(m["porNivel"]["revisar"]),
           str(m["porNivel"]["atencao"]), str(m["porNivel"]["informacao"])]]
t = Table(niveis, colWidths=[LARG/4]*4)
t.setStyle(TableStyle([
    ("FONT", (0,0), (-1,0), "Helvetica", 8.5),
    ("FONT", (0,1), (-1,1), "Helvetica-Bold", 16),
    ("TEXTCOLOR", (0,0), (-1,0), MUTE),
    ("TEXTCOLOR", (0,1), (1,1), SIGNAL),
    ("TEXTCOLOR", (2,1), (-1,1), INK),
    ("BACKGROUND", (0,0), (-1,-1), TINT),
    ("TOPPADDING", (0,0), (-1,0), 7),
    ("BOTTOMPADDING", (0,1), (-1,1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 9),
]))
hist.append(t)
hist.append(Spacer(1, 6))
hist.append(Paragraph(
    f"{m['porLane']['tela']} eventos na gravação de tela · "
    f"{m['porLane']['audio']} no áudio · {m['porLane']['camera']} na câmera", S["mute"]))

if an.get("fundoVirtual", {}) and an["fundoVirtual"].get("virtual"):
    hist.append(Spacer(1, 8))
    box = Table([[Paragraph(
        "<b>A câmera usa plano de fundo virtual.</b> O ambiente atrás do candidato é uma "
        "imagem sintética, então objetos e pessoas ao fundo não são observáveis nesta "
        "gravação. A ausência de detecções ali não significa que não havia nada.",
        S["mute"])]], colWidths=[LARG])
    box.setStyle(TableStyle([
        ("LINEBEFORE", (0,0), (0,-1), 2, FILL),
        ("LEFTPADDING", (0,0), (-1,-1), 9),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    hist.append(box)

# ── Sequência correlacionada ──
clusters = sorted(an.get("clusters", []), key=lambda c: c["fim"]-c["inicio"], reverse=True)
if clusters:
    c = clusters[0]
    hist.append(Paragraph("Sequência correlacionada", S["h2"]))
    hist.append(Paragraph(
        f"Entre <b>{hhmmss(c['inicio'])}</b> e <b>{hhmmss(c['fim'])}</b> — {c['titulo']}. "
        "É o trecho mais denso da gravação e o que mais merece revisão.", S["corpo"]))
    hist.append(Spacer(1, 6))
    dentro = [e for e in an["eventos"]
              if c["inicio"] <= e["t"] <= c["fim"] and e["lane"] == "tela"]
    linhas = [[hhmmss(e["t"]), e["titulo"], NIVEL[e["nivel"]]] for e in dentro]
    t = Table([["Tempo", "O que a tela mostrava", "Nível"]] + linhas,
              colWidths=[20*mm, LARG-48*mm, 28*mm])
    t.setStyle(TableStyle([
        ("FONT", (0,0), (-1,0), "Helvetica-Bold", 8),
        ("FONT", (0,1), (-1,-1), "Helvetica", 9),
        ("TEXTCOLOR", (0,0), (-1,0), MUTE),
        ("TEXTCOLOR", (0,1), (0,-1), CALM),
        ("LINEBELOW", (0,0), (-1,0), 0.6, RULE),
        ("LINEBELOW", (0,1), (-1,-2), 0.3, RULE),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    hist.append(t)

hist.append(PageBreak())

# ── Eventos, um a um, com a evidência ──
hist.append(Paragraph("Eventos na gravação de tela", S["h2"]))
hist.append(Paragraph(
    "Cada evento traz o quadro da gravação que o sustenta. Nenhuma afirmação "
    "aqui existe sem a imagem correspondente.", S["mute"]))
hist.append(Spacer(1, 10))

ordem = {"alta": 0, "revisar": 1, "atencao": 2, "informacao": 3}
tela = sorted([e for e in an["eventos"] if e["lane"] == "tela"], key=lambda e: e["t"])

# Duas colunas: a evidência à esquerda, a leitura à direita. Em largura total
# a imagem empurra cada evento para uma página própria e o documento incha.
IMG_L = 88*mm
TXT_L = LARG - IMG_L - 6*mm

for e in tela:
    bloco = []
    cab = Table([[Paragraph(hhmmss(e["t"]), S["tc"]),
                  Paragraph(NIVEL[e["nivel"]], S["rotulo"])]],
                colWidths=[LARG-35*mm, 35*mm])
    cab.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("ALIGN", (1,0), (1,0), "RIGHT"),
        ("TEXTCOLOR", (1,0), (1,0), SIGNAL if e["nivel"] in ("alta","revisar") else MUTE),
        ("BOTTOMPADDING", (0,0), (-1,-1), 1),
        ("TOPPADDING", (0,0), (-1,-1), 0),
        ("LINEABOVE", (0,0), (-1,0), 0.4, RULE),
        ("TOPPADDING", (0,0), (-1,-1), 8),
    ]))
    bloco.append(cab)
    bloco.append(Paragraph(e["titulo"], S["evtit"]))
    bloco.append(Spacer(1, 5))

    esquerda = []
    poster = e.get("poster")
    cam = os.path.join(BASE, poster) if poster else None
    if cam and os.path.exists(cam):
        esquerda.append(Image(cam, width=IMG_L, height=IMG_L*576/1024))
        esquerda.append(Spacer(1, 3))
        esquerda.append(Paragraph(e["fonte"], S["mute"]))
    else:
        esquerda.append(Paragraph("Sem quadro associado.", S["mute"]))

    direita = [
        Paragraph("O que a gravação mostra", S["h3"]),
        Paragraph(e["observado"], S["corpo"]),
        Spacer(1, 5),
        Paragraph("O que isso pode significar", S["h3"]),
        Paragraph(e["significado"], S["mute"]),
    ]

    par = Table([[esquerda, direita]], colWidths=[IMG_L+6*mm, TXT_L])
    par.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (0,0), 0),
        ("RIGHTPADDING", (0,0), (0,0), 6),
        ("LEFTPADDING", (1,0), (1,0), 0),
        ("TOPPADDING", (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
    ]))
    bloco.append(par)
    bloco.append(Spacer(1, 12))
    hist.append(KeepTogether(bloco))

# ── Como foi produzido ──
hist.append(PageBreak())
hist.append(Paragraph("Como esta análise foi produzida", S["h2"]))

origem = []
origem.append(("Gravação de tela",
    "Leitura quadro a quadro da barra de endereço e da barra de abas do navegador. "
    "Cada evento foi conferido na imagem antes de entrar no relatório."))
if an.get("origemAudio"):
    origem.append(("Áudio",
        "Detecção de voz com Silero VAD, executada localmente. O detector aponta a "
        "presença de voz humana, mas não distingue quem fala."))
if an.get("origemCamera"):
    origem.append(("Câmera",
        "Detecção facial com YuNet, executada localmente. Mede presença, contagem de "
        "pessoas e orientação aproximada da cabeça — não a direção do olhar."))

for titulo, texto in origem:
    hist.append(Paragraph(titulo, S["h3"]))
    hist.append(Paragraph(texto, S["mute"]))
    hist.append(Spacer(1, 7))

hist.append(Paragraph("O que este relatório não afirma", S["h2"]))
for item in [
    "Não conclui se houve irregularidade. Os níveis indicam prioridade de revisão, não culpa.",
    "Não identifica quem fala nos trechos de áudio.",
    "Não mede a direção do olhar, apenas a posição da cabeça.",
    "Não observa fones de ouvido nem smartwatch, que não são detectados pelo modelo usado.",
    "Consultas a material próprio ou à documentação da instituição podem ser permitidas — "
    "as regras da certificação definem, não este documento.",
]:
    hist.append(Paragraph(f"• {item}", S["mute"]))
    hist.append(Spacer(1, 4))

doc.build(hist)
print(f"gerado: {SAIDA}")
