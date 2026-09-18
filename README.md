# Integridade — análise de gravações de avaliação

Interface de revisão para gravações de prova: transforma horas de vídeo em uma
linha do tempo de eventos, cada um ligado ao trecho que o sustenta.

Este repositório cobre **upload, processamento, linha do tempo e detalhe do
evento**, tudo numa página só: o envio ocupa o topo, e o resultado aparece
abaixo quando a análise termina. Dashboard da instituição, comparação entre
candidatos e relatório final ainda não estão implementados.

A análise é simulada (cerca de 9 segundos). Qualquer arquivo enviado abre a
análise da gravação de exemplo — a interface diz isso ao usuário antes do envio.

## Rodar

```
npm install
npm run dev     # http://localhost:3100
```

## De onde vêm os dados

Os eventos de **tela** são reais. Foram extraídos de uma gravação de 3h07 de uma
certificação (`ead.cigam.com.br`, 50 questões), verificando quadro a quadro a
barra de endereço e a barra de abas do navegador. Cada um tem um recorte de 14
segundos em `public/evidencia/`, cortado da gravação original e aberto 7
segundos antes do evento.

O que a gravação mostra, e que está registrado aqui: DeepSeek, ChatGPT, uma aba
do Google Gemini, o Copilot disponível sobre um PDF no Edge, buscas no Google e
páginas da wiki interna — além de um PDF de materiais de estudo aberto do disco
local.

Os eventos de **câmera** e **áudio** marcados com `simulado: true` são exemplos
de formato. A análise dessas faixas não foi executada nesta amostra, e por isso
eles aparecem com a etiqueta "exemplo" na interface e não têm vídeo associado.
Nenhum evento de câmera ou áudio afirma algo que não tenha sido verificado.

## Decisões de design

Tema claro Lector: fundo `#F7F9FC`, texto navy `#071B3D`, laranja `#FF7A1A`,
azul `#2563EB`. Ver `src/index.css`.

**Dois tons de laranja.** Sobre fundo claro o `#FF7A1A` alcança só 2,6:1, então
ele preenche marcadores e botões mas nunca vira texto — o texto laranja usa
`#A8460A` (5,6:1). Pelo mesmo motivo o botão principal é laranja com texto navy
(7:1) em vez de texto branco, que reprovaria.

**O progresso é a própria linha do tempo.** A área de envio já mostra as três
faixas vazias que o resultado vai ter; durante a análise uma varredura corre da
esquerda para a direita e os eventos aparecem conforme ela passa. Ao terminar, a
área encolhe para uma barra e cede o espaço ao resultado.

**Sem escala verde-amarelo-vermelho.** O semáforo lê como veredicto, e o produto
não emite veredicto. Os quatro níveis escalam em peso dentro de uma cor só:
traço → anel vazado → ponto sólido → ponto com halo.

**Agrupamento é forma, não cor.** Evento isolado é um ponto; sequência
correlacionada é um vão marcado na régua. A forma carrega a correlação.

**Linha do tempo em duas escalas.** Seis eventos dentro de 164 segundos de uma
gravação de 11.231 segundos colapsam em um pixel. A visão geral mostra a
proporção; o recorte ampliado é a única escala em que os eventos são legíveis.

**"O que a gravação mostra" e "o que isso pode significar" são campos
separados** em todo evento, lado a lado. A separação é estrutural, não editorial.

## Estrutura

```
src/
  data/analise.ts         eventos, agrupamentos e resumo
  components/Timeline.tsx visão geral + recorte ampliado
  components/EventList.tsx
  components/EventDetail.tsx  player, evidência e decisão do revisor
public/evidencia/         15 recortes .mp4 + poster .jpg
```


## Análise real (pipeline)

O front consome os JSON produzidos pelo pipeline. Não existe mais dado fixo no
código: `src/data/analise.ts` foi convertido em `public/analises/cigam-israel-castro/`
e o tipo do formato vive em `src/data/tipos.ts`.

```bash
node --env-file=.env scripts/analisar.mjs <video.mp4> --orcamento 220
```

Opções: `--saida <dir>`, `--orcamento <n>` (teto de quadros enviados),
`--lote <n>`, `--paralelo <n>`, `--sem-clipes`, `--reprocessar`.

Saída em `public/analises/<slug>/`: `analise.json`, `quadros/` e `evidencia/`.

### Como funciona

1. **Amostragem** — `ffmpeg` detecta trocas de cena e as ordena por força. Um
   piso regular tapa buracos em trechos longos e parados. Existe um teto de
   quadros porque uma gravação de 3h produz mais de mil trocas de cena
   (digitação, rolagem, cursor) e sem teto o custo fica imprevisível.
2. **Extração** — de cada instante saem duas imagens: o quadro inteiro reduzido
   e um recorte da faixa superior em resolução nativa. O segundo existe porque
   a URL é a evidência de maior valor e some quando o quadro é reduzido.
3. **Classificação** — Gemini recebe os quadros em lote e devolve JSON validado
   por schema. A instrução proíbe concluir irregularidade e manda devolver vazio
   em vez de supor. Retentativa com backoff, porque 503 e 429 são rotina.
4. **Eventos** — quadros contíguos com o mesmo app viram um evento com duração.
   Nível por categoria, de forma determinística.
5. **Sequências** — eventos externos próximos formam um agrupamento, e os
   retornos à prova que caem dentro do vão entram junto: é justamente o
   "saiu, consultou, voltou" que caracteriza a correlação.
6. **Evidência** — um trecho de vídeo por evento.

As observações brutas do modelo ficam salvas no `analise.json`, então dá para
ajustar níveis, títulos e regras de agrupamento com `--reprocessar`, sem gastar
uma chamada de API.

### Como o front encontra as análises

`public/analises/index.json` é o manifesto: cada análise se registra nele ao ser
gerada. A tela de envio lista o que já existe, e `?analise=<slug>` abre um
resultado direto — é o link que o revisor compartilha com quem precisa ver a
mesma evidência.

As duas análises presentes:

| slug | origem | eventos |
|---|---|---|
| `whatsapp-video-2026-09-18-at-10-40-52` | pipeline (Gemini) | 5, sendo 2 para revisar |
| `cigam-israel-castro` | tela manual, câmera YuNet | 15, sendo 8 para revisar |

A de origem `manual` foi montada à mão a partir da leitura quadro a quadro da
gravação de 3h07, antes do pipeline existir. Ela usa o mesmo formato, e a
interface mostra a origem no topo para que ninguém confunda as duas.

### Áudio (Silero VAD, local) — desligado por padrão

Existe e funciona, mas **não é executado a menos que se peça** com `--com-audio`.

O motivo veio dos números: na gravação do CIGAM a faixa de áudio gerou 26 dos 41
eventos — **63% do relatório e zero da fila de revisão**. Numa prova com
avaliador na chamada de vídeo, conversar é o comportamento esperado, e o
detector aponta voz sem dizer de quem é. O resultado era volume sem sinal.

Vale ligar quando a prova **não tem avaliador na chamada**: aí qualquer voz é
notável e o VAD sozinho já diz muito.

Roda sem API e sem rede: `modelos/silero_vad.onnx` (2,3 MB, MIT) via
`onnxruntime-node`. Três horas de áudio em **49 segundos**.

O detector responde apenas "há voz humana neste trecho". Ele **não separa quem
fala**, então nada no código afirma "segunda pessoa" ou "conversa" — isso
exigiria diarização, que é outro modelo. O texto de cada evento diz isso.

Duas armadilhas que custaram caro e estão resolvidas no código:

- **A entrada do Silero v5 tem 576 amostras**, não 512: são 64 amostras de
  contexto anterior concatenadas ao bloco. Alimentar só o bloco faz a
  probabilidade colapsar perto de zero no arquivo inteiro, sem erro nenhum.
  Foi o que aconteceu aqui: 350.976 janelas de uma reunião com duas pessoas
  conversando deram máximo 0,2. Com o contexto, a mediana vai a 1,0.
- **A contagem de eventos é por desvio, não por trecho.** O VAD corta a cada
  respiro, então uma conversa de 45s vira dezenas de trechos. Emitir um evento
  por trecho gerou 16 "Fala durante DeepSeek" seguidos. Agora cada saída da
  prova rende no máximo um evento de áudio.

### Câmera (YuNet, local)

`modelos/yunet.onnx` (233 KB, Apache-2.0, OpenCV Zoo) via `onnxruntime-node`.
Detecção facial em ~50 ms por quadro; 1124 amostras de uma gravação de 3h em
**79 segundos**.

Três decisões que vieram de medição, não de palpite:

- **Detectar no recorte da câmera, não no quadro inteiro.** O rosto do candidato
  ocupa ~46 px numa gravação 1920x1080; ao reduzir o quadro para a entrada do
  modelo ele vira ~15 px e a detecção falha. Medido: quadro inteiro acertou 1 de
  7 quadros, recorte acertou 7 de 7 com score ~0,93.
- **A posição da câmera é procurada, não configurada.** Varia entre gravações —
  superior direito no Teams, superior esquerdo no OBS. A busca varre os quatro
  cantos e acertou 100% nos dois formatos.
- **Sem rosto na região não é ausência.** Antes de registrar ausência, o quadro
  inteiro é conferido. Nesta base, 28 das 30 amostras sem rosto na região eram a
  fase de galeria do início, com o candidato visível o tempo todo. Sem essa
  checagem o relatório acusaria 260 segundos de ausência de alguém presente.

A referência de "olhando para a prova" sai da mediana da própria gravação: não
existe posição correta universal, ela depende de onde está a câmera e o monitor.
Só desvios sustentados viram evento — um movimento de cabeça de um segundo não
diz nada.

**Isto não é estimativa de olhar.** Os 5 pontos do YuNet dizem onde estão olhos,
nariz e boca, não para onde a pupila aponta. O que se infere é a orientação da
cabeça, e de forma grosseira. Para olhar de verdade seria preciso um modelo
dedicado (`yakhyo/gaze-estimation`, MIT).

### Objetos (YOLOX, local)

`modelos/yolox.onnx` (36 MB, Apache-2.0, OpenCV Zoo) via `onnxruntime-node`, 80
classes COCO. ~85 ms por quadro.

**Por que YOLOX e não RF-DETR.** O RF-DETR não publica ONNX pronto: exige rodar
o export deles em Python com torch, e o licenciamento é dividido (só os pesos
"Apache-designated" são Apache-2.0; XL e 2XL são PML 1.0). O YOLOX entrega a
mesma vantagem de licença sem trazer Python. Se quiserem a precisão do RF-DETR
depois, é um export único que gera um `.onnx` para trocar no lugar.

**Só a região da câmera é analisada.** No quadro inteiro o próprio
compartilhamento de tela é detectado como "notebook" e "tv", com caixas de
1738x981 cobrindo a prova. Detectar objetos na tela não diz nada sobre o
ambiente do candidato.

### Plano de fundo virtual

A análise mede se a câmera usa fundo virtual, e isso muda o que a faixa de
câmera pode afirmar. Com fundo virtual o ambiente atrás do candidato é uma
imagem sintética: objetos ali não existem e uma segunda pessoa entrando na sala
é apagada pela segmentação. Dizer "nenhum dispositivo detectado" nesse caso dá
confiança falsa — o detector não estava olhando para a sala.

A medição é a diferença média de pixels de um trecho do fundo ao longo da
gravação. Na base de teste: **0,26 no Teams** (fundo virtual, 2h30 praticamente
idênticas) contra **13,7 numa gravação de fundo real**. O rosto da mesma pessoa,
usado como controle, variou 32 a 63.

Foi assim que se explicou a única detecção não-pessoa da amostra: 5 caixas de
"tv" que eram o quadro laranja do papel de parede virtual.

### Botões do navegador não são prova de uso

Uma guia em branco do Chrome foi classificada como "Gemini em primeiro plano",
nível alta atenção. A página estava vazia: o que o modelo viu foi o botão
**"Peça ao Gemini"** e o **"Modo IA"** da barra do navegador, presentes em
qualquer página daquele Chrome. Num relatório isso viraria "o candidato usou o
Gemini".

A instrução ao modelo agora trata isso explicitamente — vale também para o
"Perguntar ao Copilot" do Edge, que aparece na outra gravação da base. Só o
conteúdo da página e a barra de endereço contam. Depois da correção o mesmo
quadro virou "Mecanismo de busca", nível revisar, com a descrição "Navegador
aberto em uma nova guia em branco".

### Passada completa de ponta a ponta

Gravação de 63s, quatro etapas juntas:

```
7 trocas de cena → 7 quadros dentro do orçamento
3/7 dentro da assinatura "lector" (43%) → 4 desvios para o modelo
áudio:   0 trecho de fala (faixa muda: -91 dB na origem)
câmera:  canto superior-esquerdo localizado sozinho, 32 amostras, 0 evento
objetos: 13 amostras, só "pessoa", 0 evento
fundo:   real (variação 2,23)
→ 5 eventos, 1 sequência correlacionada
```

Só 4 chamadas ao modelo numa gravação inteira. Áudio, câmera, objetos e fundo
rodaram local.

### Regras da certificação

`public/regras/<nome>.json` descreve o que aquela avaliação permite e proíbe.
As regras entram em dois lugares: na instrução do modelo e na atribuição de
nível dos eventos.

```bash
node --env-file=.env scripts/analisar.mjs <video> --regras cigam-relatorios
```

Sem isso o relatório hesita em todo evento — "pode ser consulta autorizada, a
regra da certificação define" — porque ninguém informou a regra. Com isso, o
mesmo conjunto de eventos se reorganiza:

| Categoria | Sem regras | Com regras |
|---|---|---|
| wiki interna, PDF de estudo | Atenção | **Informação** (permitido) |
| ChatGPT, DeepSeek, Gemini | Revisar | **Alta atenção** (proibido) |
| busca no Google | Revisar | **Alta atenção** (proibido) |

Na gravação do CIGAM isso moveu 13 dos 14 eventos de tela. Seis consultas
autorizadas saíram da fila de revisão e sete ferramentas proibidas entraram no
topo dela.

O texto de cada evento muda junto. "Documento aberto durante a prova, pode ser
material de apoio permitido" vira "Material de estudo próprio pode ser
consultado — registrado para o histórico, sem indicação de problema".

A regra não afrouxa o princípio: a instrução ao modelo continua proibindo
afirmar violação. Ela muda **o que é relevante registrar**, não o que se afirma.
Quem decide continua sendo quem revisa.

### Limites conhecidos

- **O envio não dispara a análise.** O botão abre uma análise já processada. O
  pipeline roda por linha de comando, fora do navegador — uma gravação de 3h
  leva dezenas de minutos, o que não cabe numa Vercel Function (teto de 300s).
  Ligar os dois pede fila e worker.

- **Fones de ouvido e smartwatch não têm classe no COCO.** O candidato desta
  gravação usa os dois, e nenhum é detectável por este modelo. Precisaria de um
  detector treinado para isso.
- **Em gravações com fundo virtual, a faixa de objetos vale pouco.** Só o que
  está no recorte do candidato é real.
- **A orientação da cabeça não é o olhar.** Ver a seção de câmera acima.
- **O áudio não identifica quem fala.** O VAD detecta voz, não locutor — por
  isso está desligado por padrão. Para "voz adicional" e "conversa entre duas
  pessoas" seria preciso diarização, ou mandar o áudio para o Gemini, que
  transcreve e separa locutores por cerca de US$ 0,09 por gravação. O Claude não
  aceita áudio em nenhuma forma.
- **A chave atual é de tier restrito.** `gemini-pro-latest` responde 429 por
  cota e vários modelos retornam 503. Volume real pede chave paga.
- **Latência.** Cerca de 1 a 2 minutos por lote sob instabilidade da API. Uma
  gravação de 3h com 220 quadros leva dezenas de minutos.
- **Dados do candidato não saem do vídeo.** Nome, prova e instituição só
  aparecem quando a análise os traz; o pipeline não os inventa.
