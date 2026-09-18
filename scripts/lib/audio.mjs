import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import ort from 'onnxruntime-node';

const exec = promisify(execFile);

export const TAXA = 16000;      // o Silero opera a 8k ou 16k
const JANELA = 512;             // amostras por passo a 16 kHz = 32 ms
const CONTEXTO = 64;            // o v5 exige 64 amostras anteriores à frente do bloco
const MODELO = 'modelos/silero_vad.onnx';

export async function extrairAudio(video, destino) {
  await mkdir(path.dirname(destino), { recursive: true });
  await exec('ffmpeg', [
    '-nostdin', '-v', 'error', '-i', video,
    '-vn', '-ac', '1', '-ar', String(TAXA), '-c:a', 'pcm_s16le',
    destino, '-y',
  ], { maxBuffer: 1024 * 1024 });
  return destino;
}

/** Lê PCM 16 bits mono. Percorre os blocos em vez de assumir cabeçalho de 44 bytes. */
export async function lerWav(caminho) {
  const buf = await readFile(caminho);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('arquivo não é WAV');

  let pos = 12;
  let dados = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const tam = buf.readUInt32LE(pos + 4);
    if (id === 'data') { dados = buf.subarray(pos + 8, pos + 8 + tam); break; }
    pos += 8 + tam + (tam % 2);
  }
  if (!dados) throw new Error('bloco de dados não encontrado no WAV');

  const amostras = new Float32Array(dados.length / 2);
  for (let i = 0; i < amostras.length; i++) amostras[i] = dados.readInt16LE(i * 2) / 32768;
  return amostras;
}

/**
 * Detecção de fala com Silero VAD.
 *
 * O modelo diz apenas se há voz humana no trecho — ele não separa quem fala.
 * Por isso nada aqui afirma "segunda pessoa" ou "conversa": isso exigiria
 * diarização, que é outro modelo.
 */
export async function detectarFala(amostras, opcoes = {}) {
  const {
    limiar = 0.5,
    limiarSaida = 0.35,
    minFalaMs = 250,
    minSilencioMs = 700,
    margemMs = 120,
  } = opcoes;

  const sessao = await ort.InferenceSession.create(MODELO);
  let estado = new Float32Array(2 * 1 * 128);
  let contexto = new Float32Array(CONTEXTO);
  const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(TAXA)]), []);

  /* O modelo espera 576 amostras: as 64 anteriores mais o bloco de 512.
     Alimentar só o bloco faz a probabilidade colapsar perto de zero em todo
     o arquivo — sem erro nenhum, o que torna a falha difícil de perceber. */
  const probs = [];
  const entrada = new Float32Array(CONTEXTO + JANELA);
  for (let i = 0; i + JANELA <= amostras.length; i += JANELA) {
    const bloco = amostras.subarray(i, i + JANELA);
    entrada.set(contexto, 0);
    entrada.set(bloco, CONTEXTO);

    const saida = await sessao.run({
      input: new ort.Tensor('float32', Float32Array.from(entrada), [1, CONTEXTO + JANELA]),
      state: new ort.Tensor('float32', estado, [2, 1, 128]),
      sr,
    });
    probs.push(saida.output.data[0]);
    estado = Float32Array.from(saida.stateN.data);
    contexto = bloco.slice(JANELA - CONTEXTO);
  }

  // ── Pós-processamento: probabilidade por janela vira trechos com início e fim ──
  const porJanela = JANELA / TAXA;
  const minFala = minFalaMs / 1000;
  const minSilencio = minSilencioMs / 1000;
  const margem = margemMs / 1000;

  const trechos = [];
  let dentro = false;
  let inicio = 0;
  let ultimoAcima = 0;

  probs.forEach((p, i) => {
    const t = i * porJanela;
    if (!dentro && p >= limiar) {
      dentro = true; inicio = t; ultimoAcima = t;
    } else if (dentro) {
      if (p >= limiarSaida) ultimoAcima = t;
      else if (t - ultimoAcima >= minSilencio) {
        if (ultimoAcima - inicio >= minFala) trechos.push({ inicio, fim: ultimoAcima });
        dentro = false;
      }
    }
  });
  if (dentro) {
    const fim = probs.length * porJanela;
    if (fim - inicio >= minFala) trechos.push({ inicio, fim });
  }

  const duracao = probs.length * porJanela;
  return {
    duracao,
    trechos: trechos.map((t) => ({
      inicio: Math.max(0, Number((t.inicio - margem).toFixed(2))),
      fim: Math.min(duracao, Number((t.fim + margem).toFixed(2))),
    })),
    janelas: probs.length,
  };
}

/**
 * Junta trechos separados por pausas curtas.
 *
 * O VAD corta a cada respiro, então uma conversa de 45 segundos sai picada em
 * dezenas de trechos. Sem unir, cada pausa viraria um evento e a linha do tempo
 * afogaria o que importa. Três segundos é o intervalo que mantém uma fala
 * contínua inteira sem colar duas conversas distintas.
 */
export function unirTrechos(trechos, pausaMax = 3) {
  const unidos = [];
  for (const t of trechos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && t.inicio - ultimo.fim <= pausaMax) ultimo.fim = t.fim;
    else unidos.push({ ...t });
  }
  return unidos;
}

/** Trechos sem fala acima de um limite viram silêncios observáveis. */
export function silencios(trechos, duracao, minSegundos = 120) {
  const vazios = [];
  let cursor = 0;
  for (const t of trechos) {
    if (t.inicio - cursor >= minSegundos) vazios.push({ inicio: cursor, fim: t.inicio });
    cursor = Math.max(cursor, t.fim);
  }
  if (duracao - cursor >= minSegundos) vazios.push({ inicio: cursor, fim: duracao });
  return vazios;
}
