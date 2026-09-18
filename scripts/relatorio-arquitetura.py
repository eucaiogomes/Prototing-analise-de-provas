#!/usr/bin/env python3
"""Local + API vs tudo via API multimodal: economia de escala."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle)

SAIDA="relatorios/arquitetura-local-vs-api.pdf"
INK=colors.HexColor("#071B3D"); MUTE=colors.HexColor("#5B6B85")
RULE=colors.HexColor("#DFE7F1"); SIGNAL=colors.HexColor("#A8460A")
TINT=colors.HexColor("#EDF2F9"); VERDE=colors.HexColor("#1B6B4A")

def st(n,**kw):
    b=dict(fontName="Helvetica",fontSize=9.5,leading=14,textColor=INK,alignment=TA_LEFT);b.update(kw)
    return ParagraphStyle(n,**b)
S={"titulo":st("t",fontName="Helvetica-Bold",fontSize=20,leading=23),
   "sub":st("s",fontSize=10,textColor=MUTE,leading=15),
   "h2":st("h2",fontName="Helvetica-Bold",fontSize=13,leading=17,spaceBefore=15,spaceAfter=6),
   "h3":st("h3",fontName="Helvetica-Bold",fontSize=10,leading=13,spaceBefore=8,spaceAfter=3),
   "corpo":st("c",leading=15),"mute":st("m",fontSize=9,textColor=MUTE,leading=13.5),
   "cel":st("cel",fontSize=8.5,leading=12),"celm":st("celm",fontSize=8.5,leading=12,textColor=MUTE),
   "celb":st("celb",fontSize=8.5,leading=12,fontName="Helvetica-Bold"),
   "celd":st("celd",fontSize=8.5,leading=12,fontName="Helvetica-Bold",textColor=SIGNAL),
   "celv":st("celv",fontSize=8.5,leading=12,fontName="Helvetica-Bold",textColor=VERDE),
   "th":st("th",fontSize=8,leading=11,fontName="Helvetica-Bold",textColor=MUTE)}
LARG=A4[0]-40*mm

def rodape(c,d):
    c.saveState();c.setStrokeColor(RULE);c.setLineWidth(0.5)
    c.line(20*mm,14*mm,A4[0]-20*mm,14*mm)
    c.setFont("Helvetica",7.5);c.setFillColor(MUTE)
    c.drawString(20*mm,9.5*mm,"Baseado em medições sobre a gravação de 3h07; projeções de volume são estimativa")
    c.drawRightString(A4[0]-20*mm,9.5*mm,str(d.page));c.restoreState()

doc=BaseDocTemplate(SAIDA,pagesize=A4,leftMargin=20*mm,rightMargin=20*mm,topMargin=18*mm,
                    bottomMargin=20*mm,title="Local + API vs tudo via API")
doc.addPageTemplates([PageTemplate(id="p",frames=[Frame(doc.leftMargin,doc.bottomMargin,doc.width,doc.height)],onPage=rodape)])
h=[];P_=lambda t,s="corpo":Paragraph(t,S[s])

def tab(cab,linhas,larg,destaque=None):
    d=[[Paragraph(c,S["th"]) for c in cab]]
    for ln in linhas: d.append([Paragraph(str(c),S[e]) for c,e in ln])
    t=Table(d,colWidths=larg,repeatRows=1)
    e=[("LINEBELOW",(0,0),(-1,0),0.6,RULE),("LINEBELOW",(0,1),(-1,-2),0.3,RULE),
       ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
       ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),6),
       ("VALIGN",(0,0),(-1,-1),"TOP")]
    if destaque is not None: e.append(("BACKGROUND",(0,destaque),(-1,destaque),TINT))
    t.setStyle(TableStyle(e));return t

h.append(P_("Local + API ou tudo via API?","titulo"));h.append(Spacer(1,4))
h.append(P_("A pergunta é se, com muitos usuários, vale eliminar os modelos locais e mandar "
            "tudo para uma API multimodal — trocando custo de máquina por custo de token.","sub"))

h.append(P_("O achado que muda a conta","h2"))
h.append(P_("Medi quanto do processamento local é ffmpeg e quanto são os modelos. "
            "A divisão é desfavorável ao argumento de tirar os modelos:","corpo"))
h.append(Spacer(1,8))
h.append(tab(["Etapa","Tipo","Tempo (3h07)"],
    [[("Detecção de cena","cel"),("ffmpeg","celm"),("63 s","cel")],
     [("Corte dos clipes de evidência","cel"),("ffmpeg","celm"),("60 s","cel")],
     [("Recortes de câmera","cel"),("ffmpeg","celm"),("47 s","cel")],
     [("Extração de quadros e recortes","cel"),("ffmpeg","celm"),("44 s","cel")],
     [("<b>Subtotal ffmpeg</b>","celb"),("<b>inevitável</b>","celd"),("<b>214 s — 69%</b>","celb")],
     [("Silero (áudio)","cel"),("modelo","celm"),("49 s","cel")],
     [("YuNet (rostos)","cel"),("modelo","celm"),("31 s","cel")],
     [("YOLOX (objetos)","cel"),("modelo","celm"),("16 s","cel")],
     [("<b>Subtotal modelos</b>","celb"),("<b>substituível</b>","celb"),("<b>96 s — 31%</b>","celb")]],
    [70*mm,32*mm,38*mm],destaque=5))
h.append(Spacer(1,7))
h.append(P_("<b>Tirar todos os modelos locais economiza 31% da máquina — e a máquina continua "
            "necessária.</b> Decodificar o vídeo, extrair quadros e cortar os trechos de "
            "evidência é ffmpeg, e nenhuma API faz isso por você. O produto promete que toda "
            "afirmação leva ao trecho de vídeo; esses trechos precisam ser cortados em algum "
            "lugar.","corpo"))
h.append(Spacer(1,5))
h.append(P_("Medição direta: um recorte de câmera custa <b>42 ms de ffmpeg</b> e <b>28 ms de "
            "YuNet</b>. O modelo é a parte barata.","mute"))

h.append(P_("Três arquiteturas, custo por gravação de 3h","h2"))
h.append(tab(["Arquitetura","API","Máquina","Total","Qualidade"],
    [[("Híbrido (atual)","celb"),("US$ 0,11","celv"),("214 s + 96 s","celm"),
      ("US$ 0,15","celv"),("lê a URL","celm")],
     [("Tudo via API, em quadros","celb"),("US$ 0,48","celd"),("214 s","celm"),
      ("US$ 0,52","celd"),("lê a URL","celm")],
     [("Tudo via API, vídeo nativo","celb"),("US$ 0,36","celd"),("~60 s (clipes)","celm"),
      ("US$ 0,37","celd"),("perde a URL","celd")]],
    [44*mm,22*mm,30*mm,22*mm,30*mm],destaque=1))
h.append(Spacer(1,7))
h.append(P_("Vídeo nativo no Gemini custa ~100 tokens por segundo em baixa resolução e ~300 em "
            "alta. Três horas dão 1,4 milhão de tokens em baixa — já acima da janela de "
            "contexto, o que obriga a fatiar a gravação.","mute"))

h.append(P_("O problema de qualidade do vídeo nativo","h2"))
h.append(P_("Este é o ponto que decide, e não é de custo. A evidência mais forte da análise é a "
            "<b>URL na barra de endereço</b> — foi ela que identificou chat.deepseek.com, "
            "chatgpt.com e a busca no Google. É texto minúsculo.","corpo"))
h.append(Spacer(1,5))
h.append(P_("Já comprovei nesta base que um quadro reduzido a 1024 px <b>perde a URL</b>: "
            "precisei enviar um recorte da barra de endereço em resolução nativa para o modelo "
            "conseguir ler. O modo de vídeo nativo amostra a 1 quadro por segundo e reduz a "
            "resolução — exatamente o que destrói esse sinal. Em baixa resolução a URL é "
            "ilegível, e em alta o custo triplica e ainda não há como recortar a barra.","corpo"))

h.append(P_("Economia de escala","h2"))
h.append(P_("Uma máquina de 8 vCPU processa cerca de 5.000 gravações de 3h por mês a 70% de "
            "ocupação. Custo de referência: US$ 53/mês em provedor de vCPU dedicada.","mute"))
h.append(Spacer(1,8))
h.append(tab(["Volume/mês","Máquinas","Custo máquina","API","Total","Por gravação"],
    [[("100","celb"),("1 pequena","celm"),("US$ 26","cel"),("US$ 11","cel"),
      ("US$ 37","celb"),("US$ 0,37","celm")],
     [("1.000","celb"),("1","celm"),("US$ 53","cel"),("US$ 110","cel"),
      ("US$ 163","celb"),("US$ 0,16","celm")],
     [("10.000","celb"),("2","celm"),("US$ 106","cel"),("US$ 1.100","cel"),
      ("US$ 1.206","celb"),("US$ 0,12","celm")],
     [("50.000","celb"),("10","celm"),("US$ 530","cel"),("US$ 5.500","cel"),
      ("US$ 6.030","celb"),("US$ 0,12","celm")]],
    [24*mm,24*mm,28*mm,24*mm,26*mm,24*mm]))
h.append(Spacer(1,7))
h.append(P_("<b>A partir de mil gravações por mês a API domina a conta, não as máquinas.</b> "
            "Em dez mil por mês as máquinas são 9% do total. Tirar os modelos locais para "
            "economizar máquina ataca a menor parte do problema — e sobe a parte maior, porque "
            "é justamente a assinatura da tela que filtra 43% das chamadas.","corpo"))

h.append(P_("Tráfego","h2"))
h.append(P_("Os quadros enviados à API somam <b>27 MB por gravação</b> — medido, não estimado: "
            "31 KB por quadro. O vídeo de origem tem 810 MB. Mandar o vídeo inteiro para a API "
            "multiplica o tráfego por <b>30</b>.","corpo"))
h.append(Spacer(1,6))
h.append(tab(["Volume/mês","Só os quadros","Vídeo inteiro"],
    [[("1.000","celb"),("26 GB","celv"),("791 GB","celd")],
     [("10.000","celb"),("262 GB","celv"),("7,7 TB","celd")]],
    [30*mm,40*mm,40*mm]))

h.append(P_("Onde a API realmente ganha","h2"))
h.append(P_("O argumento operacional é legítimo e os números acima não o capturam: máquina "
            "significa provisionar, monitorar, atualizar e lidar com falha. Isso tem custo "
            "humano que não aparece em dólar por gravação.","corpo"))
h.append(Spacer(1,5))
h.append(P_("E em volume baixo a conta se inverte: com 100 gravações por mês, a máquina é 70% "
            "do custo e fica ociosa quase o tempo todo. Abaixo de algumas centenas por mês, "
            "pagar por token e não manter servidor é defensável.","corpo"))

h.append(P_("Recomendação","h2"))
h.append(P_("<b>Manter o híbrido.</b> Não porque os modelos locais sejam baratos — e sim porque "
            "a máquina é inevitável de qualquer forma, e os modelos custam 31% dela enquanto "
            "cortam a conta de API em mais do que isso.","corpo"))
h.append(Spacer(1,5))
h.append(P_("O caminho para escalar não é tirar os modelos: é <b>gastar menos API por gravação</b>. "
            "As alavancas, em ordem de retorno: Batch API corta 50%; cache de prompt reduz a "
            "entrada repetida; a assinatura da tela já filtra 43% e melhora com mais exemplares; "
            "e o OCR local da barra de endereço substituiria parte das chamadas de visão por "
            "leitura determinística e gratuita.","corpo"))

h.append(P_("Ressalvas","h2"))
for i in ["A divisão ffmpeg/modelos é <b>medida</b>. As projeções de volume são estimativa: "
          "nunca rodei este pipeline em produção nem em máquina de nuvem.",
          "A vazão de 5.000 gravações por máquina assume gravações de 3h. Provas mais curtas "
          "mudam tudo para melhor.",
          "Preços de máquina são de provedor de vCPU dedicada. Em AWS sob demanda, o custo "
          "de máquina dobra ou triplica e o argumento da API melhora.",
          "O custo de vídeo nativo supõe uma passada só. Fatiar a gravação para caber na "
          "janela de contexto pode repetir contexto e aumentar a conta."]:
    h.append(Paragraph(f"• {i}",S["mute"]));h.append(Spacer(1,5))

doc.build(h);print("gerado:",SAIDA)
