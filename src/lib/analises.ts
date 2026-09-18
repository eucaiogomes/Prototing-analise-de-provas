import type { Analise, ItemManifesto } from '../data/tipos';

const RAIZ = '/analises';

export async function carregarManifesto(): Promise<ItemManifesto[]> {
  const r = await fetch(`${RAIZ}/index.json`);
  if (!r.ok) throw new Error(`Não foi possível ler a lista de análises (${r.status}).`);
  return r.json();
}

export async function carregarAnalise(slug: string): Promise<Analise> {
  const r = await fetch(`${RAIZ}/${slug}/analise.json`);
  if (!r.ok) throw new Error(`Não foi possível ler a análise “${slug}” (${r.status}).`);
  return r.json();
}

/** Os caminhos de mídia no JSON são relativos à pasta da análise. */
export function midia(slug: string, caminho?: string) {
  return caminho ? `${RAIZ}/${slug}/${caminho}` : undefined;
}
