import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);

export async function sondar(video) {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-show_entries', 'stream=width,height,codec_type',
    '-of', 'json', video,
  ]);
  const d = JSON.parse(stdout);
  const v = d.streams.find((s) => s.codec_type === 'video');
  return {
    duracao: Math.round(Number(d.format.duration)),
    largura: v?.width ?? 0,
    altura: v?.height ?? 0,
    temAudio: d.streams.some((s) => s.codec_type === 'audio'),
  };
}

/**
 * Escolhe os instantes que valem olhar.
 *
 * O orçamento existe porque uma gravação de 3h produz mais de mil trocas de
 * cena — digitação, rolagem, cursor. Sem teto, o custo fica imprevisível.
 *
 * Ordem de prioridade: as trocas de cena mais fortes primeiro; o piso regular
 * entra só para tapar buracos, para que trechos longos e parados não passem
 * despercebidos. Quando dois candidatos ficam perto demais, vence o mais forte.
 */
export async function escolherQuadros(video, opcoes = {}) {
  const { duracao } = await sondar(video);

  const {
    limiar = 0.2,
    // Gravação curta pede granularidade fina; uma de 3h, não.
    passo = Math.max(15, Math.round(duracao / 60)),
    minimoEntre = duracao < 300 ? 2 : 8,
    orcamento = 220,
  } = opcoes;

  // metadata=print:file=- escreve em stdout, não em stderr.
  const { stdout, stderr } = await exec('ffmpeg', [
    '-nostdin', '-v', 'error', '-i', video,
    '-vf', `scale=640:-2,select='gt(scene,${limiar})',metadata=print:file=-`,
    '-an', '-f', 'null', '-',
  ], { maxBuffer: 128 * 1024 * 1024 });

  const linhas = (stdout + stderr).split('\n');
  const cenas = [];
  for (let i = 0; i < linhas.length; i++) {
    const t = linhas[i].match(/pts_time:([\d.]+)/);
    if (!t) continue;
    const f = linhas[i + 1]?.match(/lavfi\.scene_score=([\d.]+)/);
    const instante = Number(t[1]);
    if (instante < 1 || instante > duracao - 1) continue;
    cenas.push({ t: instante, forca: f ? Number(f[1]) : limiar });
  }

  // 1. As trocas de cena disputam entre si por força.
  const escolhidas = [];
  for (const c of [...cenas].sort((a, b) => b.forca - a.forca)) {
    if (escolhidas.length >= Math.round(orcamento * 0.8)) break;
    if (escolhidas.some((e) => Math.abs(e.t - c.t) < minimoEntre)) continue;
    escolhidas.push(c);
  }

  // 2. O piso só tapa buracos maiores que `passo`.
  const porTempo = escolhidas.map((c) => c.t).sort((a, b) => a - b);
  const comPiso = [...porTempo];
  let anterior = 0;
  for (const t of [...porTempo, duracao]) {
    for (let p = anterior + passo; p < t - minimoEntre; p += passo) {
      if (comPiso.length >= orcamento) break;
      comPiso.push(Math.round(p * 10) / 10);
    }
    anterior = t;
  }

  const instantes = [...new Set(comPiso)]
    .sort((a, b) => a - b)
    .slice(0, orcamento)
    .map((t) => Math.round(t * 10) / 10);

  return { instantes, totalCenas: cenas.length, duracao };
}

export async function extrairQuadro(video, t, destino, largura = 1024) {
  await mkdir(path.dirname(destino), { recursive: true });
  await exec('ffmpeg', [
    '-nostdin', '-v', 'error', '-ss', String(t), '-i', video,
    '-frames:v', '1', '-vf', `scale=${largura}:-2`, '-q:v', '4', destino, '-y',
  ]);
  return destino;
}

/**
 * Recorta a faixa superior em resolução nativa.
 *
 * A URL é a evidência de maior valor da gravação de tela, e some quando o
 * quadro inteiro é reduzido para 1024px. Aqui a barra de endereço e a de abas
 * chegam ao modelo no tamanho original.
 */
export async function extrairTopo(video, t, destino, fatia = 0.16) {
  const { altura } = await sondar(video);
  const alturaCorte = Math.max(64, Math.round(altura * fatia) & ~1);
  await mkdir(path.dirname(destino), { recursive: true });
  await exec('ffmpeg', [
    '-nostdin', '-v', 'error', '-ss', String(t), '-i', video,
    '-frames:v', '1', '-vf', `crop=iw:${alturaCorte}:0:0`, '-q:v', '2', destino, '-y',
  ]);
  return destino;
}

export async function cortarClipe(video, inicio, duracao, destino, largura = 1024) {
  await mkdir(path.dirname(destino), { recursive: true });
  await exec('ffmpeg', [
    '-nostdin', '-v', 'error', '-ss', String(Math.max(0, inicio)), '-i', video,
    '-t', String(duracao), '-vf', `scale=${largura}:-2`,
    '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', destino, '-y',
  ]);
  return destino;
}
