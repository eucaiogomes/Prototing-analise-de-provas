/** Formato produzido por scripts/analisar.mjs e consumido pela interface. */

export type Lane = 'tela' | 'camera' | 'audio';
export type Nivel = 'informacao' | 'atencao' | 'revisar' | 'alta';
export type Decisao = 'pendente' | 'confirmado' | 'descartado';

export type Categoria =
  // gravação de tela
  | 'ia' | 'busca' | 'consulta' | 'documento' | 'sistema' | 'prova' | 'outro'
  // câmera
  | 'comportamento' | 'presenca' | 'pessoas' | 'dispositivo'
  // áudio
  | 'fala';

export interface Evento {
  id: string;
  t: number;
  duracao: number;
  lane: Lane;
  categoria: Categoria;
  nivel: Nivel;
  titulo: string;
  /** O que a gravação mostra. Vem do modelo, factual. */
  observado: string;
  /** Leitura possível. Template por categoria — nunca uma conclusão. */
  significado: string;
  fonte: string;
  clipeInicio: number;
  clipe?: string;
  poster?: string;
  cluster?: string;
  confianca?: number;
  simulado?: boolean;
}

export interface Cluster {
  id: string;
  inicio: number;
  fim: number;
  titulo: string;
  resumo: string;
}

export interface Metricas {
  total: number;
  paraRevisar: number;
  porNivel: Record<Nivel, number>;
  porLane: Record<Lane, number>;
}

export interface Analise {
  gerado: string;
  modelo: string | null;
  /** 'pipeline' = analisada pelo modelo. 'manual' = montada à mão. */
  origem: 'pipeline' | 'manual';
  gravacao: {
    arquivo: string;
    duracao: number;
    largura: number;
    altura: number;
    temAudio: boolean;
  };
  /** Dados do candidato não saem do vídeo; só existem quando informados. */
  avaliacao?: {
    candidato: string;
    prova: string;
    instituicao: string;
    data: string;
    questoes?: number;
  };
  amostragem: { quadrosEnviados: number; trocasDeCena: number; orcamento: number } | null;
  metricas: Metricas;
  resumo: string;
  /** Câmera com plano de fundo virtual: o ambiente atrás não é observável. */
  fundoVirtual?: { virtual: boolean; variacao: number; limiar: number; amostras: number } | null;
  eventos: Evento[];
  clusters: Cluster[];
  rotuloCurto?: Record<string, string>;
}

export interface ItemManifesto {
  slug: string;
  arquivo: string;
  duracao: number;
  origem: 'pipeline' | 'manual';
  eventos: number;
  paraRevisar: number;
  gerado: string;
}
