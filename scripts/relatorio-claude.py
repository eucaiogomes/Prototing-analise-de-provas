#!/usr/bin/env python3
"""Custo de rodar a análise com modelos Anthropic, incluindo o cenário multi-câmera."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle)

SAIDA = "relatorios/custo-modelos-anthropic.pdf"
INK=colors.HexColor("#071B3D"); MUTE=colors.HexColor("#5B6B85")
RULE=colors.HexColor("#DFE7F1"); SIGNAL=colors.HexColor("#A8460A")
CALM=colors.HexColor("#2563EB"); TINT=colors.HexColor("#EDF2F9")

def st(n, **kw):
    b=dict(fontName="Helvetica",fontSize=9.5,leading=14,textColor=INK,alignment=TA_LEFT); b.update(kw)
    return ParagraphStyle(n,**b)
S={"titulo":st("t",fontName="Helvetica-Bold",fontSize=20,leading=23),
   "sub":st("s",fontSize=10,textColor=MUTE,leading=15),
   "h2":st("h2",fontName="Helvetica-Bold",fontSize=13,leading=17,spaceBefore=15,spaceAfter=6),
   "h3":st("h3",fontName="Helvetica-Bold",fontSize=10,leading=13,spaceBefore=8,spaceAfter=3),
   "corpo":st("c",leading=15), "mute":st("m",fontSize=9,textColor=MUTE,leading=13.5),
   "cel":st("cel",fontSize=8.5,leading=12), "celm":st("celm",fontSize=8.5,leading=12,textColor=MUTE),
   "celb":st("celb",fontSize=8.5,leading=12,fontName="Helvetica-Bold"),
   "celd":st("celd",fontSize=8.5,leading=12,fontName="Helvetica-Bold",textColor=SIGNAL),
   "th":st("th",fontSize=8,leading=11,fontName="Helvetica-Bold",textColor=MUTE)}
LARG=A4[0]-40*mm

def rodape(c,d):
    c.saveState(); c.setStrokeColor(RULE); c.setLineWidth(0.5)
    c.line(20*mm,14*mm,A4[0]-20*mm,14*mm)
    c.setFont("Helvetica",7.5); c.setFillColor(MUTE)
    c.drawString(20*mm,9.5*mm,"Cálculo sobre a gravação de 3h07 analisada nesta sessão — não é fatura")
    c.drawRightString(A4[0]-20*mm,9.5*mm,str(d.page)); c.restoreState()

doc=BaseDocTemplate(SAIDA,pagesize=A4,leftMargin=20*mm,rightMargin=20*mm,
                    topMargin=18*mm,bottomMargin=20*mm,title="Custo com modelos Anthropic")
doc.addPageTemplates([PageTemplate(id="p",frames=[Frame(doc.leftMargin,doc.bottomMargin,doc.width,doc.height)],onPage=rodape)])
h=[]; P_=lambda t,s="corpo": Paragraph(t,S[s])

def tab(cab,linhas,larg,destaque=None):
    d=[[Paragraph(c,S["th"]) for c in cab]]
    for ln in linhas: d.append([Paragraph(str(c),S[e]) for c,e in ln])
    t=Table(d,colWidths=larg,repeatRows=1)
    e=[("LINEBELOW",(0,0),(-1,0),0.6,RULE),("LINEBELOW",(0,1),(-1,-2),0.3,RULE),
       ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
       ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),6),
       ("VALIGN",(0,0),(-1,-1),"TOP")]
    if destaque is not None: e.append(("BACKGROUND",(0,destaque),(-1,destaque),TINT))
    t.setStyle(TableStyle(e)); return t

h.append(P_("Rodar a análise com modelos Anthropic","titulo")); h.append(Spacer(1,4))
h.append(P_("Custo de substituir o Gemini por Claude, e o que muda ao acrescentar uma "
            "câmera cenital. Base de cálculo: a mesma gravação de 3h07 analisada nesta sessão.","sub"))

h.append(P_("Como o Claude cobra imagem","h2"))
h.append(P_("O Claude enxerga a imagem em blocos de 28x28 pixels. O custo é a "
            "<b>largura dividida por 28, vezes a altura dividida por 28</b>, cada divisão "
            "arredondada para cima. Isso muda a conta em relação ao Gemini, que cobra um "
            "valor fixo por imagem independente do tamanho.","corpo"))
h.append(Spacer(1,6))
h.append(P_("Existem dois tiers de resolução, e isso importa mais do que o preço por token:","corpo"))
h.append(Spacer(1,6))
h.append(tab(["Tier","Modelos","Lado maior","Teto de tokens"],
    [[("Alta resolução","celb"),("Opus 5, Sonnet 5","cel"),("2.576 px","cel"),("4.784","cel")],
     [("Padrão","celb"),("Haiku 4.5","cel"),("1.568 px","cel"),("1.568","cel")]],
    [30*mm,50*mm,30*mm,40*mm]))
h.append(Spacer(1,6))
h.append(P_("O Haiku reduz imagens maiores que 1.568 px, então a mesma faixa da barra de "
            "endereço custa 280 tokens nele e 483 no Opus. O tier barato também envia menos "
            "detalhe — é um corte de custo e de fidelidade ao mesmo tempo.","mute"))

h.append(P_("Cenário atual: só a tela","h2"))
h.append(P_("125 desvios enviados ao modelo (a assinatura da prova já filtrou 43%), "
            "duas imagens por desvio: o quadro inteiro e a faixa da barra de endereço.","mute"))
h.append(Spacer(1,8))
h.append(tab(["Modelo","Entrada","Saída","Custo","Com Batch (-50%)","vs Gemini"],
    [[("Gemini 3.1 Flash-Lite","celb"),("292.600","celm"),("22.500","celm"),
      ("US$ 0,110","celb"),("—","celm"),("referência","celm")],
     [("Haiku 4.5","celb"),("144.725","celm"),("22.500","celm"),
      ("US$ 0,257","celb"),("US$ 0,129","celd"),("1,2x","celm")],
     [("Sonnet 5","celb"),("170.100","celm"),("22.500","celm"),
      ("US$ 0,565","celb"),("US$ 0,283","celd"),("2,6x","celm")],
     [("Opus 5","celb"),("170.100","celm"),("22.500","celm"),
      ("US$ 1,413","celb"),("US$ 0,707","celd"),("6,4x","celm")]],
    [36*mm,24*mm,20*mm,24*mm,30*mm,18*mm]))
h.append(Spacer(1,7))
h.append(P_("<b>O Batch API corta 50% e serve perfeitamente aqui:</b> ninguém precisa do "
            "resultado em tempo real. Com Batch, o Haiku 4.5 sai por US$ 0,13 — praticamente "
            "o mesmo que o Gemini, com um modelo estável em vez de um preview.","corpo"))

h.append(P_("Cenário com câmera cenital","h2"))
h.append(P_("Três fluxos: tela, câmera do candidato e uma câmera de cima mostrando a mesa. "
            "Essa terceira câmera resolve o problema que travou a análise atual — o plano de "
            "fundo virtual apagava o ambiente, e por isso celular, papéis e segundo aparelho "
            "eram invisíveis. De cima, a mesa aparece de verdade.","corpo"))
h.append(Spacer(1,8))
h.append(P_("Componha os fluxos numa imagem só","h3"))
h.append(P_("Montar os três numa grade custa menos e rende mais: <b>1.560 tokens</b> numa "
            "composição de 1456x819 contra <b>2.331</b> em três imagens separadas. E o modelo "
            "vê as três visões juntas, que é justamente o que permite correlacionar "
            "\"olhou para baixo + celular na mesa + troca de aba\".","corpo"))
h.append(Spacer(1,8))
h.append(tab(["Abordagem","Amostras","Haiku 4.5","Sonnet 5","Opus 5"],
    [[("Tudo ao modelo, a cada 20s","celb"),("561","celm"),
      ("US$ 0,75","cel"),("US$ 1,50","cel"),("US$ 3,75","cel")],
     [("Híbrido: detectores locais filtram","celb"),("185","celm"),
      ("US$ 0,25","celd"),("US$ 0,50","celd"),("US$ 1,24","celd")]],
    [56*mm,20*mm,24*mm,24*mm,24*mm]))
h.append(Spacer(1,5))
h.append(P_("Valores já com Batch. No híbrido, YuNet e YOLOX continuam varrendo tudo de graça "
            "e o Claude só olha os momentos que eles marcaram, mais os desvios de tela.","mute"))

h.append(P_("Recomendação","h2"))
h.append(P_("<b>Sonnet 5, em Batch, no modo híbrido: US$ 0,50 por gravação de 3 horas</b> "
            "(~R$ 2,70), já com as três câmeras. É cinco vezes o Gemini atual, sobre um modelo "
            "muito mais capaz e que não é preview.","corpo"))
h.append(Spacer(1,6))
h.append(P_("Se o volume for alto, o Haiku 4.5 faz o mesmo por US$ 0,25 — vale medir os dois "
            "no mesmo conjunto de gravações antes de decidir. O Opus 5 só se justifica se a "
            "leitura de tela precisar de julgamento que os outros dois erram; nesse caso, "
            "usá-lo apenas nos eventos de alta atenção sai mais barato que nivelar tudo por cima.","corpo"))
h.append(Spacer(1,6))
h.append(P_("O que não muda com a troca: áudio, detecção facial, objetos e fundo virtual "
            "continuam locais e de graça. O modelo só entra onde é preciso interpretar.","corpo"))

h.append(P_("Ressalvas","h2"))
for i in ["Os preços do Claude são de um cache de <b>24/06/2026</b>; a fórmula de tokens foi "
          "conferida hoje na documentação. Confirme no painel antes de fechar orçamento.",
          "Não consegui medir com <b>count_tokens</b> — esta máquina não tem credencial Anthropic. "
          "Os números vêm da fórmula oficial, não de uma chamada real.",
          "A contagem de saída (180 a 200 tokens por quadro) é a observada no JSON que o "
          "pipeline gera hoje. Um esquema maior sobe esse custo.",
          "O cenário de três câmeras é projeção: nunca rodei sobre uma gravação assim. "
          "A quantidade de amostras é chute informado, não medição.",
          "O cache de prompt (a instrução do sistema é idêntica em todos os lotes) reduz mais "
          "um pouco a entrada e não está incluído nestes números."]:
    h.append(Paragraph(f"• {i}",S["mute"])); h.append(Spacer(1,5))

doc.build(h); print("gerado:",SAIDA)
