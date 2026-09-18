import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/* Descritor perceptual de um quadro, sem biblioteca de imagem: o ffmpeg
   entrega os pixels já reduzidos e a conta é feita aqui.

   Três olhares sobre o mesmo quadro:
   - total  — a página inteira, que muda quando o candidato troca de site
   - topo   — a moldura do navegador, estável enquanto ele fica na mesma aba
   - corpo  — o conteúdo, que muda de questão para questão dentro da prova

   O brilho entra porque separa página clara de página escura com uma conta só. */

async function cinzaCru(entrada, t, filtroExtra = '') {
  const vf = [filtroExtra, 'scale=9:8', 'format=gray'].filter(Boolean).join(',');
  const busca = t === null ? [] : ['-ss', String(t)];
  const { stdout } = await exec('ffmpeg', [
    '-nostdin', '-v', 'error', ...busca, '-i', entrada,
    '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-',
  ], { encoding: 'buffer', maxBuffer: 1024 * 1024 });
  return stdout;
}

async function medir(entrada, t) {
  const [total, topo, corpo] = await Promise.all([
    cinzaCru(entrada, t),
    cinzaCru(entrada, t, 'crop=iw:ih*0.18:0:0'),
    cinzaCru(entrada, t, 'crop=iw:ih*0.6:0:ih*0.2'),
  ]);
  return { total: dhash(total), topo: dhash(topo), corpo: dhash(corpo), brilho: brilhoMedio(total) };
}

/** dHash: cada bit diz se o pixel é mais claro que o vizinho à direita. */
function dhash(buf) {
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += buf[y * 9 + x] > buf[y * 9 + x + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

function brilhoMedio(buf) {
  let s = 0;
  for (const b of buf) s += b;
  return Math.round(s / buf.length);
}

export async function descritor(video, t) {
  return { t, ...(await medir(video, t)) };
}

/**
 * Descritor a partir de um quadro já extraído.
 *
 * É a forma usada no pipeline: garante que a decisão sobre estar dentro ou fora
 * da prova venha exatamente da mesma imagem que vai para o modelo e para a
 * evidência. Buscar de novo dentro do vídeo abriria margem para divergência.
 */
export async function descritorDeImagem(caminho, t) {
  return { t, ...(await medir(caminho, null)) };
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/**
 * Distância entre dois quadros, de 0 (idênticos) a 1.
 *
 * O corpo pesa menos que o total porque dentro da prova ele muda a cada
 * questão — se pesasse igual, virar a página contaria como sair da prova.
 */
export function distancia(a, b) {
  const estrutura = (hamming(a.total, b.total) / 64) * 0.55 + (hamming(a.corpo, b.corpo) / 64) * 0.2;
  const aparencia = Math.min(1, Math.abs(a.brilho - b.brilho) / 90) * 0.25;
  return Number((estrutura + aparencia).toFixed(4));
}

/** Agrupa descritores por semelhança. Cada grupo vira um exemplar da assinatura. */
export function agrupar(descritores, tolerancia) {
  const grupos = [];
  for (const d of descritores) {
    const alvo = grupos.find((g) => distancia(g.exemplar, d) <= tolerancia);
    if (alvo) alvo.membros.push(d);
    else grupos.push({ exemplar: d, membros: [d] });
  }
  return grupos.sort((a, b) => b.membros.length - a.membros.length);
}

/**
 * Uma assinatura é um conjunto de exemplares, não um só: a prova tem várias
 * telas legítimas — enunciado, revisão, tela de envio. Ficar dentro de
 * qualquer uma delas conta como estar na prova.
 */
export function construirAssinatura(descritores, { nome, tolerancia = 0.10, maxExemplares = 16 }) {
  const grupos = agrupar(descritores, tolerancia).slice(0, maxExemplares);
  return {
    nome,
    criada: new Date().toISOString(),
    tolerancia,
    quadrosUsados: descritores.length,
    exemplares: grupos.map((g) => ({
      total: g.exemplar.total,
      topo: g.exemplar.topo,
      corpo: g.exemplar.corpo,
      brilho: g.exemplar.brilho,
      ocorrencias: g.membros.length,
      instante: g.exemplar.t,
    })),
  };
}

/**
 * Procura sinal de contaminação na assinatura.
 *
 * Uma baseline envenenada é a falha mais perigosa deste método: basta um quadro
 * errado entrar como "prova" para a assinatura passar a aceitar exatamente o que
 * deveria acusar — e em silêncio, porque nada dá erro. Telas legítimas de uma
 * mesma avaliação se parecem entre si; exemplares muito distantes um do outro
 * quase sempre significam que algo que não é a prova entrou na amostra.
 */
export function conferirCoerencia(assinatura) {
  const ex = assinatura.exemplares;
  const avisos = [];
  for (let i = 0; i < ex.length; i++) {
    for (let j = i + 1; j < ex.length; j++) {
      const d = distancia(ex[i], ex[j]);
      const deltaBrilho = Math.abs(ex[i].brilho - ex[j].brilho);
      // 0.25 vem da medição: a maior distância observada entre telas legítimas
      // da mesma prova foi 0.115, então isto deixa mais de 2x de folga.
      // O brilho entra sozinho porque claro-contra-escuro quase nunca é
      // variação legítima de uma mesma avaliação.
      if (d > 0.25 || deltaBrilho > 80) {
        avisos.push({
          a: ex[i].instante, b: ex[j].instante, distancia: d,
          motivo: deltaBrilho > 80
            ? 'um é página clara e o outro escura'
            : 'estruturas muito diferentes',
        });
      }
    }
  }
  return avisos;
}

/** Compara um quadro com a assinatura. Devolve o exemplar mais próximo. */
export function conferir(desc, assinatura) {
  let melhor = null;
  let menor = Infinity;
  for (const e of assinatura.exemplares) {
    const d = distancia(desc, e);
    if (d < menor) { menor = d; melhor = e; }
  }
  return {
    dentro: menor <= assinatura.tolerancia,
    distancia: Number(menor.toFixed(4)),
    exemplar: melhor?.instante ?? null,
  };
}
