#!/usr/bin/env node
/**
 * Analisa uma gravação de avaliação e escreve o resultado em JSON.
 *
 *   node --env-file=.env scripts/analisar.mjs <video> [opções]
 *
 *   --saida <dir>       pasta de saída (padrão: public/analises/<nome-do-video>)
 *   --orcamento <n>     teto de quadros enviados ao modelo (padrão 220)
 *   --lote <n>          quadros por chamada (padrão 6)
 *   --paralelo <n>      chamadas simultâneas (padrão 2)
 *   --sem-clipes        não corta os trechos de vídeo
 *   --reprocessar       refaz eventos e sequências a partir do JSON já gerado,
 *                       sem chamar a API (para ajustar heurísticas de graça)
 *   --assinatura <n>    compara cada quadro com a assinatura da tela da prova;
 *                       só os desvios vão para o modelo de visão
 *   --com-audio         analisa a fala (desligado por padrão: num exame com
 *                       avaliador na chamada, conversar é o esperado e o
 *                       detector não distingue quem fala)
 *   --sem-camera        pula a detecção facial
 *   --sem-objetos       pula a detecção de objetos na região da câmera
 *   --regras <n>        regras da certificação (public/regras/<n>.json): o que é
 *                       permitido e o que é proibido nesta avaliação
 *   --passo-camera <n>  intervalo da amostragem de câmera em segundos (padrão 10)
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
import path from 'node:path';
import { escolherQuadros, extrairQuadro, extrairTopo, cortarClipe, sondar } from './lib/video.mjs';
import { classificarLote } from './lib/visao.mjs';
import { montarEventos, montarEventosAudio, montarEventosCamera, montarEventosObjetos, montarClusters, montarResumo, montarMetricas, hhmmss } from './lib/eventos.mjs';
import { detectarObjetos } from './lib/objetos.mjs';
import { extrairAudio, lerWav, detectarFala, unirTrechos } from './lib/audio.mjs';
import { localizarCamera, amostrarCamera, detectarFundoVirtual } from './lib/rostos.mjs';
import { descritorDeImagem, conferir } from './lib/assinatura.mjs';

const args = process.argv.slice(2);
const video = args.find((a) => !a.startsWith('--'));
const opt = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i === -1 ? padrao : args[i + 1];
};
const tem = (nome) => args.includes(`--${nome}`);

if (!video) {
  console.error('uso: node --env-file=.env scripts/analisar.mjs <video> [--saida dir] [--orcamento 220]');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY não definida. Use --env-file=.env');
  process.exit(1);
}

const slug = path.basename(video).replace(/\.[^.]+$/, '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60);

const saida = opt('saida', path.join('public', 'analises', slug));
const orcamento = Number(opt('orcamento', 220));
const tamLote = Number(opt('lote', 6));
const paralelo = Number(opt('paralelo', 2));

const log = (...a) => console.log(...a);

const arquivoJson = path.join(saida, 'analise.json');

/* Reprocessar: as observações do modelo já estão no JSON, então dá para
   reajustar níveis, títulos e sequências sem gastar uma chamada sequer. */
if (tem('reprocessar')) {
  const anterior = JSON.parse(await readFile(arquivoJson, 'utf8'));
  if (!anterior.observacoes?.length) {
    console.error(`${arquivoJson} não guarda observações brutas. Rode a análise completa uma vez.`);
    process.exit(1);
  }
  const ev = montarEventos(anterior.observacoes, { duracao: anterior.gravacao.duracao, regras });
  const cl = montarClusters(ev);
  const instantesSalvos = anterior.observacoes.map((o) => o.instante);
  const nome = (t) => `quadros/q${String(Math.round(t * 10)).padStart(7, '0')}.jpg`;
  for (const e of ev) {
    e.clipe = `evidencia/${e.id}.mp4`;
    e.poster = nome(instantesSalvos.reduce((a, b) => (Math.abs(b - e.t) < Math.abs(a - e.t) ? b : a)));
  }
  const atualizado = {
    ...anterior,
    origem: anterior.origem ?? 'pipeline',
    metricas: montarMetricas(ev),
    resumo: montarResumo(ev, cl, anterior.gravacao.duracao),
    eventos: ev,
    clusters: cl,
  };
  await writeFile(arquivoJson, JSON.stringify(atualizado, null, 2));
  await atualizarManifesto(path.dirname(saida), slug, atualizado);
  console.log(`\nReprocessado sem API: ${ev.length} eventos, ${cl.length} sequência(s)\n`);
  for (const e of ev) {
    console.log(`  ${hhmmss(e.t).padStart(8)}  ${e.nivel.padEnd(11)} ${e.cluster ? '[' + e.cluster + '] ' : '     '}${e.titulo}`);
  }
  console.log('');
  process.exit(0);
}

/* As regras da certificação entram na instrução do modelo e na atribuição de
   nível. Sem elas o relatório hesita em todo evento; com elas, o que a
   instituição autoriza vira informação e o que ela proíbe sobe de prioridade. */
const nomeRegras = opt('regras');
let regras = null;
if (nomeRegras) {
  regras = JSON.parse(await readFile(path.join('public', 'regras', `${nomeRegras}.json`), 'utf8'));
  log(`\nRegras: ${regras.nome}`);
  const p = Object.keys(regras.permitido ?? {}).join(', ') || '—';
  const x = Object.keys(regras.proibido ?? {}).join(', ') || '—';
  log(`   permitido: ${p}`);
  log(`   proibido : ${x}`);
}

const meta = await sondar(video);
log(`\nGravação  ${path.basename(video)}`);
log(`Duração   ${hhmmss(meta.duracao)}   ${meta.largura}x${meta.altura}   áudio: ${meta.temAudio ? 'sim' : 'não'}`);

log('\n1. Escolhendo os instantes que valem olhar');
const { instantes, totalCenas } = await escolherQuadros(video, { orcamento });
log(`   ${totalCenas} trocas de cena detectadas → ${instantes.length} quadros dentro do orçamento`);

log('\n2. Extraindo quadros');
const dirQuadros = path.join(saida, 'quadros');
await mkdir(dirQuadros, { recursive: true });
const quadros = [];
for (const t of instantes) {
  const nome = String(Math.round(t * 10)).padStart(7, '0');
  quadros.push({
    t,
    arquivo: await extrairQuadro(video, t, path.join(dirQuadros, `q${nome}.jpg`)),
    topo: await extrairTopo(video, t, path.join(dirQuadros, `topo${nome}.jpg`)),
  });
}
log(`   ${quadros.length} quadros em ${dirQuadros}`);

/* Com assinatura, o modelo só é chamado no que foge da tela da prova. Isso
   inverte o problema: em vez de perseguir uma lista de ferramentas proibidas,
   que nunca acaba, o que não é a prova já fica documentado como desvio. */
const nomeAssinatura = opt('assinatura');
let assinatura = null;
let dentroDaProva = [];
let paraModelo = quadros;

if (nomeAssinatura) {
  log(`\n3. Conferindo contra a assinatura “${nomeAssinatura}”`);
  assinatura = JSON.parse(
    await readFile(path.join('public', 'assinaturas', `${nomeAssinatura}.json`), 'utf8')
  );
  dentroDaProva = [];
  paraModelo = [];
  for (const q of quadros) {
    const c = conferir(await descritorDeImagem(q.arquivo, q.t), assinatura);
    q.distancia = c.distancia;
    (c.dentro ? dentroDaProva : paraModelo).push(q);
  }
  const pct = ((dentroDaProva.length / quadros.length) * 100).toFixed(0);
  log(`   ${dentroDaProva.length}/${quadros.length} quadros dentro da prova (${pct}%)`);
  log(`   ${paraModelo.length} desvio(s) seguem para o modelo`);
}

log(`\n${nomeAssinatura ? '4' : '3'}. Classificando ${paraModelo.length} quadro(s) com o modelo de visão`);
const lotes = [];
for (let i = 0; i < paraModelo.length; i += tamLote) lotes.push(paraModelo.slice(i, i + tamLote));

const observacoes = [];
let feitos = 0;
let falhas = 0;

// Concorrência limitada: a cota do Gemini responde 429 se abrirmos demais.
async function trabalhador(fila) {
  while (fila.length) {
    const lote = fila.shift();
    try {
      const r = await classificarLote(lote, { apiKey: process.env.GEMINI_API_KEY, regras });
      observacoes.push(...r);
    } catch (e) {
      falhas++;
      console.warn(`   lote em ${lote[0].t}s falhou: ${String(e.message).slice(0, 120)}`);
    }
    feitos++;
    process.stdout.write(`\r   lote ${feitos}/${lotes.length}   quadros lidos: ${observacoes.length}   `);
  }
}
const fila = [...lotes];
await Promise.all(Array.from({ length: Math.min(paralelo, lotes.length) }, () => trabalhador(fila)));
log(`\n   ${observacoes.length} quadros classificados${falhas ? `, ${falhas} lote(s) perdido(s)` : ''}`);

// Os quadros que casaram com a assinatura entram sem custo, como a própria prova.
for (const q of dentroDaProva) {
  observacoes.push({
    instante: q.t,
    tela_app: assinatura.nome,
    tela_url: '',
    tela_categoria: 'prova',
    tela_descricao: `A tela corresponde à assinatura “${assinatura.nome}” (distância ${q.distancia}).`,
    abas_visiveis: [],
    camera_visivel: false,
    camera_pessoas: 1,
    camera_olhando_para_tela: true,
    camera_dispositivo_visivel: false,
    camera_observacao: '',
    confianca: Number((1 - q.distancia / assinatura.tolerancia / 2).toFixed(2)),
    porAssinatura: true,
  });
}

if (!observacoes.length) {
  console.error('\nNenhum quadro foi classificado. Análise interrompida.');
  process.exit(1);
}

/* A fala roda local, sem API: 3h de áudio em menos de um minuto. */
let trechosFala = [];
if (meta.temAudio && tem('com-audio')) {
  log('\nAnalisando o áudio (Silero VAD, local)');
  const wav = path.join(saida, 'audio.wav');
  await extrairAudio(video, wav);
  const amostras = await lerWav(wav);
  const r = await detectarFala(amostras);
  trechosFala = unirTrechos(r.trechos);
  const falando = trechosFala.reduce((x, t) => x + (t.fim - t.inicio), 0);
  log(`   ${r.trechos.length} trecho(s) brutos → ${trechosFala.length} após unir pausas curtas`);
  log(`   ${(falando / 60).toFixed(1)} min de fala (${((falando / r.duracao) * 100).toFixed(0)}% da gravação)`);
} else if (!meta.temAudio) {
  log('\nA gravação não tem faixa de áudio.');
}

/* Câmera: também local. Localiza o recorte da câmera e amostra ao longo da
   gravação. A posição varia entre gravações, então ela é procurada. */
let eventosCamera = [];
let eventosObjetos = [];
let referenciaCamera = null;
let fundoVirtual = null;
if (!tem('sem-camera')) {
  log('\nAnalisando a câmera (YuNet, local)');
  const dirCam = path.join(saida, 'camera');
  await mkdir(dirCam, { recursive: true });
  const recorte = async (t, reg) => {
    const arq = path.join(dirCam, 'r.png');
    await exec('ffmpeg', ['-nostdin', '-v', 'error', '-ss', String(t), '-i', video,
      '-frames:v', '1', '-vf', `crop=${reg.w}:${reg.h}:${reg.x}:${reg.y}`, arq, '-y']);
    return arq;
  };
  const cheio = async (t) => {
    const arq = path.join(dirCam, 'c.png');
    await exec('ffmpeg', ['-nostdin', '-v', 'error', '-ss', String(t), '-i', video,
      '-frames:v', '1', '-vf', 'scale=1280:-2', arq, '-y']);
    return arq;
  };

  const sondas = [0.25, 0.5, 0.75].map((f) => Math.round(meta.duracao * f));
  const regiao = await localizarCamera(recorte, sondas, meta);
  if (!regiao) {
    log('   Nenhum rosto encontrado nas sondas. Faixa de câmera sem eventos.');
  } else {
    log(`   Câmera no canto ${regiao.posicao} (${regiao.w}x${regiao.h}), acerto ${regiao.taxa}`);
    const passo = Number(opt('passo-camera', 10));
    const instantes = [];
    for (let t = 0; t < meta.duracao; t += passo) instantes.push(t);
    const amostras = await amostrarCamera(recorte, cheio, instantes, regiao, meta);
    const r = montarEventosCamera(amostras);
    eventosCamera = r.eventos;
    referenciaCamera = r.referencia;
    const classes = amostras.reduce((o, a) => ((o[a.classe] = (o[a.classe] || 0) + 1), o), {});
    log(`   ${amostras.length} amostras: ${JSON.stringify(classes)}`);
    log(`   ${eventosCamera.length} evento(s) de câmera`);

    // Fundo virtual muda o que a faixa de câmera pode afirmar sobre o ambiente.
    const patch = async (t) => {
      const arq = path.join(dirCam, 'p.raw.png');
      await exec('ffmpeg', ['-nostdin', '-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1',
        '-vf', `crop=${Math.round(regiao.w * 0.3)}:${Math.round(regiao.h * 0.25)}:${regiao.x}:${regiao.y}`,
        '-f', 'rawvideo', '-pix_fmt', 'gray', arq, '-y']);
      return readFile(arq);
    };
    const sondasFundo = [0.15, 0.3, 0.5, 0.7, 0.9].map((f) => Math.round(meta.duracao * f));
    fundoVirtual = await detectarFundoVirtual(patch, sondasFundo);
    if (fundoVirtual?.virtual) {
      log(`   Plano de fundo virtual (variação ${fundoVirtual.variacao}). O ambiente atrás`);
      log('   do candidato é sintético: objetos e pessoas ao fundo não são observáveis.');
    }

    if (!tem('sem-objetos')) {
      const passoObj = Number(opt('passo-objetos', 60));
      const amostrasObj = [];
      for (let t = 0; t < meta.duracao; t += passoObj) {
        const arq = await recorte(t, regiao);
        amostrasObj.push({ t, objetos: await detectarObjetos(arq, { largura: regiao.w, altura: regiao.h }) });
      }
      eventosObjetos = montarEventosObjetos(amostrasObj, { fundoVirtual: !!fundoVirtual?.virtual });
      const achados = amostrasObj.flatMap((a) => a.objetos.map((o) => o.classe));
      const cont = achados.reduce((o, c) => ((o[c] = (o[c] || 0) + 1), o), {});
      log(`   objetos em ${amostrasObj.length} amostras: ${JSON.stringify(cont)}`);
      log(`   ${eventosObjetos.length} evento(s) de objeto`);
    }
  }
}

log('\nMontando eventos e sequências');
const eventos = montarEventos(observacoes, { duracao: meta.duracao, regras });
eventos.push(...montarEventosAudio(trechosFala, eventos));
eventos.push(...eventosCamera, ...eventosObjetos);
eventos.sort((a, b) => a.t - b.t);
const clusters = montarClusters(eventos);

// O quadro extraído no instante do evento já serve de poster do player.
const nomeQuadro = (t) => `quadros/q${String(Math.round(t * 10)).padStart(7, '0')}.jpg`;
const disponiveis = new Set(instantes.map((t) => nomeQuadro(t)));
for (const e of eventos) {
  const exato = nomeQuadro(e.t);
  e.poster = disponiveis.has(exato)
    ? exato
    : nomeQuadro(instantes.reduce((a, b) => (Math.abs(b - e.t) < Math.abs(a - e.t) ? b : a)));
}
log(`   ${eventos.length} eventos, ${clusters.length} sequência(s) correlacionada(s)`);

if (!tem('sem-clipes')) {
  log('\n5. Cortando os trechos de evidência');
  const dirClipes = path.join(saida, 'evidencia');
  await mkdir(dirClipes, { recursive: true });
  for (const e of eventos) {
    const nome = `${e.id}.mp4`;
    const dur = Math.min(20, Math.max(12, e.duracao + 8));
    await cortarClipe(video, e.clipeInicio, dur, path.join(dirClipes, nome));
    e.clipe = `evidencia/${nome}`;
  }
  log(`   ${eventos.length} trechos em ${dirClipes}`);
}

const resultado = {
  gerado: new Date().toISOString(),
  modelo: process.env.GEMINI_MODELO || 'gemini-3.1-flash-lite-preview',
  gravacao: {
    arquivo: path.basename(video),
    duracao: meta.duracao,
    largura: meta.largura,
    altura: meta.altura,
    temAudio: meta.temAudio,
  },
  amostragem: {
    quadrosEnviados: paraModelo.length,
    quadrosAmostrados: quadros.length,
    trocasDeCena: totalCenas,
    orcamento,
  },
  assinatura: assinatura
    ? {
        nome: assinatura.nome,
        tolerancia: assinatura.tolerancia,
        dentro: dentroDaProva.length,
        desvios: paraModelo.length,
      }
    : null,
  // Guardadas para permitir reprocessar as heurísticas sem chamar a API de novo.
  observacoes,
  origem: 'pipeline',
  regras: regras ? { nome: regras.nome, instituicao: regras.instituicao } : null,
  referenciaCamera,
  fundoVirtual,
  metricas: montarMetricas(eventos),
  resumo: montarResumo(eventos, clusters, meta.duracao),
  eventos,
  clusters,
};

await writeFile(arquivoJson, JSON.stringify(resultado, null, 2));
await atualizarManifesto(path.dirname(saida), slug, resultado);

log(`\nPronto.  ${arquivoJson}\n`);
for (const e of eventos) {
  log(`  ${hhmmss(e.t).padStart(8)}  ${e.nivel.padEnd(11)} ${e.cluster ? '[' + e.cluster + '] ' : '     '}${e.titulo}`);
}
log('');


/* O front descobre as análises disponíveis por este manifesto, em vez de
   depender de um caminho fixo no código. */
async function atualizarManifesto(raiz, slug, resultado) {
  const arquivo = path.join(raiz, 'index.json');
  let lista = [];
  try { lista = JSON.parse(await readFile(arquivo, 'utf8')); } catch { /* primeira análise */ }
  const entrada = {
    slug,
    arquivo: resultado.gravacao.arquivo,
    duracao: resultado.gravacao.duracao,
    origem: resultado.origem,
    eventos: resultado.metricas.total,
    paraRevisar: resultado.metricas.paraRevisar,
    gerado: resultado.gerado,
  };
  lista = [entrada, ...lista.filter((x) => x.slug !== slug)];
  await writeFile(arquivo, JSON.stringify(lista, null, 2));
}
