#!/usr/bin/env node
/**
 * Cria a assinatura visual da tela de uma avaliação.
 *
 * A ideia é inverter o problema: em vez de perseguir uma lista de ferramentas
 * proibidas — que nunca acaba e não pega o que é novo — o programa aprende como
 * é a tela da prova e documenta tudo que foge dela.
 *
 *   node scripts/assinatura.mjs <video> --nome cigam --instantes 2700,6300,7200,9600
 *   node scripts/assinatura.mjs <video> --nome lector --auto
 *   node scripts/assinatura.mjs <video> --nome cigam --aferir
 *
 *   --nome <n>        identificador da assinatura
 *   --instantes a,b   segundos que são comprovadamente a tela da prova
 *   --auto            usa o agrupamento dominante da própria gravação
 *   --tolerancia <n>  distância máxima para contar como "dentro" (padrão 0.10)
 *   --aferir          não grava nada: mede a cobertura da assinatura existente
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { descritor, construirAssinatura, agrupar, conferir, conferirCoerencia } from './lib/assinatura.mjs';
import { escolherQuadros } from './lib/video.mjs';

const args = process.argv.slice(2);
const video = args.find((a) => !a.startsWith('--') && /\.(mp4|mkv|mov|webm)$/i.test(a));
const opt = (n, p) => { const i = args.indexOf(`--${n}`); return i === -1 ? p : args[i + 1]; };
const tem = (n) => args.includes(`--${n}`);

const nome = opt('nome');
if (!video || !nome) {
  console.error('uso: node scripts/assinatura.mjs <video> --nome <n> [--instantes a,b,c | --auto]');
  process.exit(1);
}

const RAIZ = path.join('public', 'assinaturas');
const arquivo = path.join(RAIZ, `${nome}.json`);
const tolerancia = Number(opt('tolerancia', 0.10));

const listados = opt('instantes');
const instantes = listados ? listados.split(',').map(Number) : null;

console.log(`\nGravação   ${path.basename(video)}`);
console.log(`Assinatura ${nome}   tolerância ${tolerancia}`);

if (tem('aferir')) {
  const assinatura = JSON.parse(await readFile(arquivo, 'utf8'));
  const { instantes: amostra } = await escolherQuadros(video, { orcamento: Number(opt('amostra', 120)) });
  console.log(`\nAferindo ${amostra.length} quadros contra ${assinatura.exemplares.length} exemplares\n`);

  let dentro = 0;
  const desvios = [];
  for (const t of amostra) {
    const c = conferir(await descritor(video, t), assinatura);
    if (c.dentro) dentro++;
    else desvios.push({ t, d: c.distancia });
  }
  const pct = ((dentro / amostra.length) * 100).toFixed(1);
  console.log(`   dentro da prova: ${dentro}/${amostra.length}  (${pct}%)`);
  console.log(`   desvios:         ${desvios.length}`);
  console.log(`\n   Só os desvios precisariam do modelo de visão.`);
  console.log(`   Economia estimada: ${pct}% das chamadas.\n`);
  for (const d of desvios.slice(0, 20)) console.log(`     ${hhmmss(d.t).padStart(9)}   distância ${d.d}`);
  if (desvios.length > 20) console.log(`     … e mais ${desvios.length - 20}`);
  console.log('');
  process.exit(0);
}

let descritores = [];
if (instantes) {
  console.log(`\nLendo ${instantes.length} instantes informados como sendo a prova`);
  for (const t of instantes) descritores.push(await descritor(video, t));
} else {
  const orcamento = Number(opt('amostra', 80));
  console.log(`\nAmostrando ${orcamento} quadros e tomando o agrupamento dominante`);
  const { instantes: amostra } = await escolherQuadros(video, { orcamento });
  for (const t of amostra) descritores.push(await descritor(video, t));

  const grupos = agrupar(descritores, tolerancia);
  const maior = grupos[0];
  const fatia = maior.membros.length / descritores.length;
  console.log(`   maior agrupamento: ${maior.membros.length}/${descritores.length} quadros (${(fatia * 100).toFixed(0)}%)`);
  if (fatia < 0.35) {
    console.warn('   Atenção: nenhum agrupamento domina a gravação. A tela da prova pode');
    console.warn('   não ser o que mais aparece aqui — confira com --instantes.');
  }
  descritores = maior.membros;
}

const assinatura = construirAssinatura(descritores, { nome, tolerancia });

const avisos = conferirCoerencia(assinatura);
if (avisos.length) {
  console.error('\n  ASSINATURA SUSPEITA DE CONTAMINAÇÃO\n');
  for (const a of avisos) {
    console.error(`   ${hhmmss(a.a)} e ${hhmmss(a.b)} distam ${a.distancia} — ${a.motivo}`);
  }
  console.error('\n  Telas de uma mesma avaliação se parecem entre si. Se um quadro que');
  console.error('  não é a prova entrou na amostra, a assinatura passa a aceitar justamente');
  console.error('  o que deveria acusar, sem dar erro. Revise os instantes informados.');
  if (!tem('forcar')) {
    console.error('\n  Nada foi gravado. Use --forcar se souber que está correto.\n');
    process.exit(1);
  }
  console.error('\n  --forcar em uso: gravando mesmo assim.\n');
}

await mkdir(RAIZ, { recursive: true });
await writeFile(arquivo, JSON.stringify(assinatura, null, 2));

console.log(`\n${assinatura.exemplares.length} exemplar(es) a partir de ${descritores.length} quadros`);
for (const e of assinatura.exemplares) {
  console.log(`   ${hhmmss(e.instante).padStart(9)}   brilho ${String(e.brilho).padStart(3)}   ${e.ocorrencias} quadro(s)`);
}
console.log(`\nGravada em ${arquivo}\n`);

function hhmmss(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}
