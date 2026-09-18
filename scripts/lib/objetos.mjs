import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ort from 'onnxruntime-node';

const exec = promisify(execFile);
const MODELO = 'modelos/yolox.onnx';
const LADO = 640;
const STRIDES = [8, 16, 32];

export const COCO = [
  'pessoa', 'bicicleta', 'carro', 'moto', 'avião', 'ônibus', 'trem', 'caminhão', 'barco',
  'semáforo', 'hidrante', 'placa de pare', 'parquímetro', 'banco', 'pássaro', 'gato',
  'cachorro', 'cavalo', 'ovelha', 'vaca', 'elefante', 'urso', 'zebra', 'girafa', 'mochila',
  'guarda-chuva', 'bolsa', 'gravata', 'mala', 'frisbee', 'esquis', 'snowboard', 'bola',
  'pipa', 'taco de beisebol', 'luva de beisebol', 'skate', 'prancha', 'raquete', 'garrafa',
  'taça', 'copo', 'garfo', 'faca', 'colher', 'tigela', 'banana', 'maçã', 'sanduíche',
  'laranja', 'brócolis', 'cenoura', 'cachorro-quente', 'pizza', 'rosquinha', 'bolo',
  'cadeira', 'sofá', 'planta', 'cama', 'mesa', 'vaso sanitário', 'tv', 'notebook', 'mouse',
  'controle remoto', 'teclado', 'celular', 'micro-ondas', 'forno', 'torradeira', 'pia',
  'geladeira', 'livro', 'relógio', 'vaso', 'tesoura', 'urso de pelúcia', 'secador', 'escova',
];

/* O que interessa a uma avaliação. O resto das 80 classes do COCO é ruído aqui. */
export const DE_INTERESSE = new Set([
  'pessoa', 'celular', 'notebook', 'tv', 'livro', 'controle remoto', 'teclado', 'mouse',
]);

let sessao = null;
const abrir = async () => (sessao ??= await ort.InferenceSession.create(MODELO));

async function pixels(entrada) {
  // 114 é a cor de preenchimento que o YOLOX usa no letterbox do treino
  const vf = `scale=${LADO}:${LADO}:force_original_aspect_ratio=decrease,`
    + `pad=${LADO}:${LADO}:0:0:color=0x727272,format=rgb24`;
  const { stdout } = await exec('ffmpeg', [
    '-nostdin', '-v', 'error', '-i', entrada,
    '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
}

export async function detectarObjetos(entrada, { largura, altura, limiar = 0.45, apenasInteresse = true } = {}) {
  const s = await abrir();
  const buf = await pixels(entrada);

  const dados = new Float32Array(3 * LADO * LADO);
  const plano = LADO * LADO;
  for (let i = 0; i < plano; i++) {
    dados[i] = buf[i * 3];
    dados[plano + i] = buf[i * 3 + 1];
    dados[2 * plano + i] = buf[i * 3 + 2];
  }

  const saida = await s.run({ images: new ort.Tensor('float32', dados, [1, 3, LADO, LADO]) });
  const out = saida.output.data;

  // O letterbox do YOLOX alinha no canto superior esquerdo, sem centralizar.
  const escala = Math.min(LADO / largura, LADO / altura);

  // Reconstrói a grade: 80x80 + 40x40 + 20x20 pontos, nesta ordem
  const grade = [];
  for (const st of STRIDES) {
    const n = LADO / st;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) grade.push({ x, y, st });
  }

  const brutas = [];
  for (let i = 0; i < grade.length; i++) {
    const b = i * 85;
    const obj = out[b + 4];
    if (obj < 0.1) continue;

    let melhorC = 0, melhorP = 0;
    for (let c = 0; c < 80; c++) {
      const p = out[b + 5 + c];
      if (p > melhorP) { melhorP = p; melhorC = c; }
    }
    const score = obj * melhorP;
    if (score < limiar) continue;

    const nome = COCO[melhorC];
    if (apenasInteresse && !DE_INTERESSE.has(nome)) continue;

    const g = grade[i];
    const cx = (out[b] + g.x) * g.st;
    const cy = (out[b + 1] + g.y) * g.st;
    const w = Math.exp(out[b + 2]) * g.st;
    const h = Math.exp(out[b + 3]) * g.st;

    brutas.push({
      classe: nome,
      score: Number(score.toFixed(3)),
      x: Math.round((cx - w / 2) / escala),
      y: Math.round((cy - h / 2) / escala),
      w: Math.round(w / escala),
      h: Math.round(h / escala),
    });
  }

  const ordenadas = brutas.sort((a, b) => b.score - a.score);
  const mantidas = [];
  for (const c of ordenadas) {
    if (mantidas.every((m) => m.classe !== c.classe || iou(m, c) < 0.45)) mantidas.push(c);
  }
  return mantidas;
}
