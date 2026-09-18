#!/usr/bin/env node
/**
 * O worker: onde o ffmpeg realmente roda.
 *
 *   node --env-file=.env.worker scripts/worker.mjs
 *
 * Fica perguntando à fila se há gravação pendente. Quando há, baixa o MP4,
 * chama o mesmo `analisar.mjs` que você roda à mão, sobe o resultado e avisa.
 *
 * Roda na sua máquina hoje. Numa VM com ffmpeg amanhã, sem mudar nada — o que
 * muda é só de onde ele fala com a fila.
 *
 * Precisa no ambiente:
 *   API_BASE               https://seu-projeto.vercel.app
 *   WORKER_SECRET          o mesmo valor configurado na Vercel
 *   BLOB_READ_WRITE_TOKEN  token do store do Blob
 *   GEMINI_API_KEY         para a etapa de visão
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { put } from '@vercel/blob';

const API = (process.env.API_BASE || '').replace(/\/$/, '');
const SEGREDO = process.env.WORKER_SECRET;
const INTERVALO = Number(process.env.INTERVALO_MS || 5000);

for (const [nome, valor] of Object.entries({
  API_BASE: API,
  WORKER_SECRET: SEGREDO,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
})) {
  if (!valor) {
    console.error(`Falta ${nome} no ambiente.`);
    process.exit(1);
  }
}

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

async function avisar(id, campos) {
  const r = await fetch(`${API}/api/jobs`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-worker-secret': SEGREDO },
    body: JSON.stringify({ id, ...campos }),
  });
  if (!r.ok) log(`  aviso ignorado (${r.status})`);
}

async function proximo() {
  const r = await fetch(`${API}/api/jobs?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`fila respondeu ${r.status}`);
  const jobs = await r.json();
  // Mais antigo primeiro: quem chegou antes é atendido antes.
  return jobs.filter((j) => j.estado === 'pendente').at(-1) ?? null;
}

async function baixar(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download falhou (${r.status})`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(destino));
}

/* As etapas que `analisar.mjs` imprime viram porcentagem. A etapa 4 é a longa
   — é ela que tem o `lote X/Y`, então é a única com progresso fino. */
function lerProgresso(linha, anterior) {
  const lote = linha.match(/lote (\d+)\/(\d+)/);
  if (lote) {
    const fracao = Number(lote[1]) / Number(lote[2]);
    return { progresso: 30 + fracao * 45, etapa: `Lendo a tela (${lote[1]}/${lote[2]})` };
  }
  const mapa = [
    [/1\. Escolhendo/, 5, 'Procurando os instantes que valem olhar'],
    [/2\. Extraindo/, 15, 'Extraindo os quadros'],
    [/3\. Conferindo/, 25, 'Comparando com a tela da prova'],
    [/4\. Classificando/, 30, 'Lendo a tela'],
    [/Analisando a câmera/, 76, 'Analisando a câmera'],
    [/Montando eventos/, 84, 'Correlacionando os eventos'],
    [/5\. Cortando/, 88, 'Cortando os trechos de evidência'],
  ];
  for (const [re, progresso, etapa] of mapa) {
    if (re.test(linha)) return { progresso, etapa };
  }
  return anterior;
}

function analisar(video, saida, job) {
  return new Promise((resolve, reject) => {
    // As chaves já estão no ambiente do worker e são herdadas pelo filho.
    const args = [
      'scripts/analisar.mjs',
      video,
      '--saida', saida,
      '--paralelo', process.env.PARALELO || '6',
    ];
    if (job.assinatura) args.push('--assinatura', job.assinatura);
    if (job.regras) args.push('--regras', job.regras);

    const p = spawn('node', args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let estado = { progresso: 5, etapa: 'Começando' };
    let ultimoAviso = 0;
    let erro = '';

    const acompanhar = (texto) => {
      for (const linha of texto.split('\n')) {
        if (!linha.trim()) continue;
        process.stdout.write(`    ${linha}\n`);
        estado = lerProgresso(linha, estado);
      }
      // Um aviso a cada 3s basta; a fila não precisa de cada linha.
      if (Date.now() - ultimoAviso > 3000) {
        ultimoAviso = Date.now();
        avisar(job.id, estado).catch(() => {});
      }
    };

    p.stdout.on('data', (d) => acompanhar(d.toString()));
    p.stderr.on('data', (d) => {
      erro += d.toString();
      acompanhar(d.toString());
    });
    p.on('error', reject);
    p.on('close', (codigo) =>
      codigo === 0 ? resolve() : reject(new Error(erro.trim().split('\n').at(-1) || `analisar.mjs saiu com ${codigo}`))
    );
  });
}

/** Sobe um arquivo e devolve a URL pública. */
async function subir(local, destino, tipo) {
  const { url } = await put(destino, await readFile(local), {
    access: 'public',
    contentType: tipo,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return url;
}

async function emLotes(itens, tamanho, tarefa) {
  const saida = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(tarefa))));
  }
  return saida;
}

/**
 * Sobe a análise e as mídias que ela referencia, e reescreve os caminhos para
 * as URLs do Blob — o front passa a ler tudo de lá, sem depender do disco.
 */
async function publicar(saida, job) {
  const analise = JSON.parse(await readFile(path.join(saida, 'analise.json'), 'utf8'));

  const referenciados = new Set();
  for (const ev of analise.eventos) {
    if (ev.clipe) referenciados.add(ev.clipe);
    if (ev.poster) referenciados.add(ev.poster);
  }

  // Só sobe o que existe: um clipe pode ter falhado sem derrubar a análise.
  const existentes = new Set();
  for (const pasta of ['quadros', 'evidencia', 'camera']) {
    for (const f of await readdir(path.join(saida, pasta)).catch(() => [])) {
      existentes.add(`${pasta}/${f}`);
    }
  }

  const aSubir = [...referenciados].filter((r) => existentes.has(r));
  log(`  subindo ${aSubir.length} arquivo(s) de evidência`);

  const mapa = new Map();
  await emLotes(aSubir, 8, async (rel) => {
    const tipo = rel.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
    mapa.set(rel, await subir(path.join(saida, rel), `analises/${job.id}/${rel}`, tipo));
  });

  for (const ev of analise.eventos) {
    if (ev.clipe && mapa.has(ev.clipe)) ev.clipe = mapa.get(ev.clipe);
    if (ev.poster && mapa.has(ev.poster)) ev.poster = mapa.get(ev.poster);
  }

  analise.job = job.id;
  analise.gravacao = { ...analise.gravacao, arquivo: job.arquivo };

  const arquivoFinal = path.join(saida, 'analise.publicada.json');
  await writeFile(arquivoFinal, JSON.stringify(analise));
  return subir(arquivoFinal, `analises/${job.id}/analise.json`, 'application/json');
}

async function processar(job) {
  log(`job ${job.id}  ${job.arquivo}  (${(job.tamanho / 1048576).toFixed(0)} MB)`);
  const trabalho = await mkdtemp(path.join(tmpdir(), 'integridade-'));
  const video = path.join(trabalho, 'gravacao.mp4');
  const saida = path.join(trabalho, 'saida');

  try {
    await avisar(job.id, { estado: 'processando', etapa: 'Baixando a gravação', progresso: 2 });
    await baixar(job.videoUrl, video);
    log('  download concluído');

    await analisar(video, saida, job);

    await avisar(job.id, { etapa: 'Publicando o resultado', progresso: 92 });
    const analiseUrl = await publicar(saida, job);

    await avisar(job.id, {
      estado: 'concluido',
      etapa: 'Concluído',
      progresso: 100,
      analiseUrl,
      erro: null,
    });
    log(`  pronto → ${analiseUrl}`);
  } catch (e) {
    log(`  ERRO: ${e.message}`);
    await avisar(job.id, { estado: 'erro', etapa: 'Falhou', erro: e.message });
  } finally {
    await rm(trabalho, { recursive: true, force: true });
  }
}

log(`worker de pé, ouvindo ${API}`);
for (;;) {
  try {
    const job = await proximo();
    if (job) await processar(job);
    else await new Promise((r) => setTimeout(r, INTERVALO));
  } catch (e) {
    log(`fila indisponível: ${e.message}`);
    await new Promise((r) => setTimeout(r, INTERVALO * 2));
  }
}
