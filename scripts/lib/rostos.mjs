import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ort from 'onnxruntime-node';

const exec = promisify(execFile);
const MODELO = 'modelos/yunet.onnx';
const LADO = 640;
const STRIDES = [8, 16, 32];

let sessao = null;
const abrir = async () => (sessao ??= await ort.InferenceSession.create(MODELO));

/**
 * Pixels do quadro em 640x640, preservando proporção.
 *
 * O letterbox existe porque o modelo tem entrada fixa e a gravação é 16:9.
 * Esticar deformaria os rostos, e a câmera do candidato é um recorte pequeno
 * no canto — justo onde a deformação mais atrapalha.
 */
async function pixels(entrada) {
  const vf = `scale=${LADO}:${LADO}:force_original_aspect_ratio=decrease,`
    + `pad=${LADO}:${LADO}:(ow-iw)/2:(oh-ih)/2:color=black,format=rgb24`;
  const { stdout } = await exec('ffmpeg', [
    '-nostdin', '-v', 'error', '-i', entrada,
    '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/** Fator e deslocamento do letterbox, para devolver as coordenadas à escala original. */
function mapa(largura, altura) {
  const escala = Math.min(LADO / largura, LADO / altura);
  return {
    escala,
    dx: (LADO - Math.round(largura * escala)) / 2,
    dy: (LADO - Math.round(altura * escala)) / 2,
  };
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function nms(caixas, limite = 0.3) {
  const ordenadas = [...caixas].sort((a, b) => b.score - a.score);
  const mantidas = [];
  for (const c of ordenadas) {
    if (mantidas.every((m) => iou(m, c) < limite)) mantidas.push(c);
  }
  return mantidas;
}

export async function detectarRostos(entrada, { largura, altura, limiar = 0.6 } = {}) {
  const s = await abrir();
  const buf = await pixels(entrada);

  // rgb24 intercalado → tensor NCHW normalizado como o OpenCV faz (sem média/desvio)
  const dados = new Float32Array(3 * LADO * LADO);
  const plano = LADO * LADO;
  for (let i = 0; i < plano; i++) {
    dados[i] = buf[i * 3];
    dados[plano + i] = buf[i * 3 + 1];
    dados[2 * plano + i] = buf[i * 3 + 2];
  }

  const saida = await s.run({ input: new ort.Tensor('float32', dados, [1, 3, LADO, LADO]) });
  const { escala, dx, dy } = mapa(largura, altura);

  const brutas = [];
  for (const st of STRIDES) {
    const cls = saida[`cls_${st}`].data;
    const obj = saida[`obj_${st}`].data;
    const bbox = saida[`bbox_${st}`].data;
    const kps = saida[`kps_${st}`].data;
    const cols = LADO / st;

    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.max(0, cls[i]) * Math.max(0, obj[i]));
      if (score < limiar) continue;

      const col = i % cols, lin = Math.floor(i / cols);
      const cx = (col + bbox[i * 4]) * st;
      const cy = (lin + bbox[i * 4 + 1]) * st;
      const w = Math.exp(bbox[i * 4 + 2]) * st;
      const h = Math.exp(bbox[i * 4 + 3]) * st;

      const pontos = [];
      for (let k = 0; k < 5; k++) {
        pontos.push({
          x: ((col + kps[i * 10 + k * 2]) * st - dx) / escala,
          y: ((lin + kps[i * 10 + k * 2 + 1]) * st - dy) / escala,
        });
      }

      brutas.push({
        score: Number(score.toFixed(3)),
        x: (cx - w / 2 - dx) / escala,
        y: (cy - h / 2 - dy) / escala,
        w: w / escala,
        h: h / escala,
        pontos, // olho dir, olho esq, nariz, canto boca dir, canto boca esq
      });
    }
  }

  return nms(brutas).map((r) => ({
    ...r,
    x: Math.round(r.x), y: Math.round(r.y),
    w: Math.round(r.w), h: Math.round(r.h),
  }));
}

/**
 * Orientação aproximada da cabeça a partir dos 5 pontos do YuNet.
 *
 * Isto NÃO é estimativa de olhar: os 5 pontos dizem onde estão olhos, nariz e
 * boca, não para onde a pupila aponta. O que dá para inferir é para que lado a
 * cabeça está virada, e mesmo isso de forma grosseira. Um rosto de 50 px na
 * miniatura da câmera não sustenta mais do que isso.
 *
 * yaw  > 0  cabeça virada para um lado, < 0 para o outro
 * pitch > 0 queixo para baixo
 */
export function orientacao(rosto) {
  const [olhoDir, olhoEsq, nariz] = rosto.pontos;
  const meioOlhos = { x: (olhoDir.x + olhoEsq.x) / 2, y: (olhoDir.y + olhoEsq.y) / 2 };
  const distOlhos = Math.hypot(olhoEsq.x - olhoDir.x, olhoEsq.y - olhoDir.y);
  if (distOlhos < 1) return null;
  return {
    yaw: Number(((nariz.x - meioOlhos.x) / distOlhos).toFixed(3)),
    pitch: Number(((nariz.y - meioOlhos.y) / distOlhos).toFixed(3)),
    distOlhos: Number(distOlhos.toFixed(1)),
  };
}

/**
 * Descobre onde está o recorte da câmera dentro do quadro.
 *
 * É necessário porque o rosto do candidato ocupa poucas dezenas de pixels numa
 * gravação 1920x1080: ao reduzir o quadro inteiro para a entrada do modelo, ele
 * encolhe para ~15 px e a detecção falha. Medido nesta base, o quadro inteiro
 * acertou 1 de 7 quadros e o recorte, 7 de 7.
 *
 * A posição varia entre gravações — canto superior direito no Teams, superior
 * esquerdo no OBS — então ela é procurada, não configurada.
 */
export async function localizarCamera(extrair, instantes, { largura, altura } = {}) {
  const lw = Math.round(largura * 0.3);
  const lh = Math.round(altura * 0.42);
  const candidatas = [
    { nome: 'superior-direito', x: largura - lw, y: 0, w: lw, h: lh },
    { nome: 'superior-esquerdo', x: 0, y: 0, w: lw, h: lh },
    { nome: 'inferior-direito', x: largura - lw, y: altura - lh, w: lw, h: lh },
    { nome: 'inferior-esquerdo', x: 0, y: altura - lh, w: lw, h: lh },
    { nome: 'quadro-inteiro', x: 0, y: 0, w: largura, h: altura },
  ];

  let melhor = null;
  for (const c of candidatas) {
    const achados = [];
    for (const t of instantes) {
      const arq = await extrair(t, c);
      const r = await detectarRostos(arq, { largura: c.w, altura: c.h, limiar: 0.6 });
      if (r.length) achados.push(r[0]);
    }
    const taxa = achados.length / instantes.length;
    if (!melhor || taxa > melhor.taxa) melhor = { ...c, taxa, achados };
    if (taxa === 1 && c.nome !== 'quadro-inteiro') break; // não precisa procurar mais
  }

  if (!melhor || melhor.taxa === 0) return null;

  // Aperta a região em torno dos rostos encontrados, com folga para o movimento.
  const margem = 40;
  const xs = melhor.achados.map((a) => a.x), ys = melhor.achados.map((a) => a.y);
  const x2 = Math.max(...melhor.achados.map((a) => a.x + a.w));
  const y2 = Math.max(...melhor.achados.map((a) => a.y + a.h));

  const x = Math.max(0, melhor.x + Math.min(...xs) - margem);
  const y = Math.max(0, melhor.y + Math.min(...ys) - margem);
  return {
    posicao: melhor.nome,
    taxa: Number(melhor.taxa.toFixed(2)),
    x,
    y,
    w: Math.min(largura - x, melhor.x + x2 + margem - x),
    h: Math.min(altura - y, melhor.y + y2 + margem - y),
  };
}

/**
 * Amostra a câmera ao longo da gravação.
 *
 * Quando não há rosto na região da câmera, o quadro inteiro é conferido antes
 * de registrar ausência. Sem essa checagem, toda mudança de layout vira "sem
 * ninguém no enquadramento": nesta base, 28 das 30 amostras sem rosto na região
 * eram a fase de galeria do início, com o candidato visível o tempo todo.
 * Um relatório que acusa ausência de alguém presente é pior do que não ter o
 * dado.
 */
export async function amostrarCamera(extrairRegiao, extrairCheio, instantes, regiao, meta) {
  const amostras = [];
  for (const t of instantes) {
    const arq = await extrairRegiao(t, regiao);
    const r = await detectarRostos(arq, { largura: regiao.w, altura: regiao.h, limiar: 0.6 });

    if (r.length === 0) {
      const cheio = await extrairCheio(t);
      const fora = await detectarRostos(cheio, { largura: meta.largura, altura: meta.altura, limiar: 0.5 });
      amostras.push({ t, n: 0, yaw: null, pitch: null, classe: fora.length ? 'layout' : 'ausente' });
      continue;
    }

    const o = orientacao(r[0]);
    amostras.push({
      t,
      n: r.length,
      yaw: o?.yaw ?? null,
      pitch: o?.pitch ?? null,
      classe: r.length > 1 ? 'acompanhado' : 'normal',
    });
  }
  return amostras;
}

/**
 * Descobre se a câmera usa plano de fundo virtual.
 *
 * Isso muda o que a faixa de câmera pode afirmar. Com fundo virtual, o ambiente
 * atrás do candidato é uma imagem sintética: objetos ali não existem, e uma
 * segunda pessoa entrando na sala é apagada ou distorcida pela segmentação.
 * Relatar "nenhum dispositivo detectado" nesse caso dá uma confiança falsa —
 * o detector não estava olhando para a sala, estava olhando para um papel de
 * parede.
 *
 * Medição: o fundo virtual é praticamente idêntico quadro a quadro. Nesta base,
 * a diferença média de pixels ao longo de 2h30 ficou em 0,09–0,31, enquanto uma
 * gravação de fundo real variou 3,85–19,65 em menos de um minuto.
 */
export async function detectarFundoVirtual(extrairPatch, instantes, { limiar = 1.0 } = {}) {
  if (instantes.length < 3) return null;

  const patches = [];
  for (const t of instantes) patches.push(await extrairPatch(t));

  const diferencas = [];
  for (let i = 1; i < patches.length; i++) {
    const a = patches[0], b = patches[i];
    const n = Math.min(a.length, b.length);
    let soma = 0;
    for (let k = 0; k < n; k++) soma += Math.abs(a[k] - b[k]);
    diferencas.push(soma / n);
  }

  const ordenadas = [...diferencas].sort((x, y) => x - y);
  const mediana = ordenadas[ordenadas.length >> 1];
  return {
    virtual: mediana < limiar,
    variacao: Number(mediana.toFixed(3)),
    limiar,
    amostras: instantes.length,
  };
}
