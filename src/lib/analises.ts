import type { Analise, ItemManifesto } from '../data/tipos';

const RAIZ = '/analises';

export async function carregarManifesto(): Promise<ItemManifesto[]> {
  const r = await fetch(`${RAIZ}/index.json`);
  if (!r.ok) throw new Error(`Não foi possível ler a lista de análises (${r.status}).`);
  return r.json();
}

/**
 * Carrega uma análise por slug (as que vêm no repositório) ou por URL completa
 * (as que o worker publicou no Blob).
 */
export async function carregarAnalise(origem: string): Promise<Analise> {
  const url = /^https?:\/\//.test(origem) ? origem : `${RAIZ}/${origem}/analise.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Não foi possível ler a análise (${r.status}).`);
  return r.json();
}

/**
 * Resolve o caminho de uma mídia.
 *
 * O worker reescreve os caminhos para URLs do Blob antes de publicar, então o
 * que chega aqui pode já ser absoluto — nesse caso passa direto.
 */
export function midia(slug: string, caminho?: string) {
  if (!caminho) return undefined;
  return /^https?:\/\//.test(caminho) ? caminho : `${RAIZ}/${slug}/${caminho}`;
}
