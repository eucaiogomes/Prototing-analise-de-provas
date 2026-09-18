import type { Categoria, Evento, Lane } from '../data/tipos';

const paths: Record<Categoria, React.ReactNode> = {
  // marca de IA: quatro pontas, sem virar estrelinha de "mágica"
  ia: <path d="M8 1.5 9.5 6.5 14.5 8 9.5 9.5 8 14.5 6.5 9.5 1.5 8 6.5 6.5Z" />,
  busca: <><circle cx="7" cy="7" r="4.4" fill="none" strokeWidth="1.6" stroke="currentColor" /><path d="M10.4 10.4 14 14" strokeWidth="1.6" stroke="currentColor" fill="none" strokeLinecap="round" /></>,
  consulta: <path d="M2.5 2.6h4.3c.9 0 1.6.6 1.6 1.4v9.4c0-.6-.7-1.1-1.6-1.1H2.5Zm11 0H9.2c-.9 0-1.6.6-1.6 1.4v9.4c0-.6.7-1.1 1.6-1.1h4.3Z" fill="none" strokeWidth="1.3" stroke="currentColor" strokeLinejoin="round" />,
  documento: <path d="M3.8 1.8h5.3L12.2 5v9.2H3.8Zm5.2.3V5h3.1" fill="none" strokeWidth="1.3" stroke="currentColor" strokeLinejoin="round" />,
  sistema: <><path d="M2.5 5h11M2.5 11h11" strokeWidth="1.4" stroke="currentColor" strokeLinecap="round" /><circle cx="6" cy="5" r="1.9" fill="currentColor" /><circle cx="10.4" cy="11" r="1.9" fill="currentColor" /></>,
  comportamento: <><path d="M1.6 8s2.4-4.2 6.4-4.2S14.4 8 14.4 8s-2.4 4.2-6.4 4.2S1.6 8 1.6 8Z" fill="none" strokeWidth="1.3" stroke="currentColor" /><circle cx="8" cy="8" r="1.8" fill="currentColor" /></>,
  presenca: <><circle cx="8" cy="5.2" r="2.7" fill="none" strokeWidth="1.4" stroke="currentColor" /><path d="M2.9 14.2c0-2.8 2.3-5 5.1-5s5.1 2.2 5.1 5" fill="none" strokeWidth="1.4" stroke="currentColor" strokeLinecap="round" /></>,
  fala: <path d="M2 8h1.6M5.2 4.6v6.8M8 2.4v11.2M10.8 5.4v5.2M14 7.2v1.6" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" />,
  prova: <><path d="M3.6 2.4h8.8v11.2H3.6Z" fill="none" strokeWidth="1.3" stroke="currentColor" strokeLinejoin="round" /><path d="M6 6.2h4M6 9.2h4" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round" /></>,
  pessoas: <><circle cx="6" cy="5.4" r="2.3" fill="none" strokeWidth="1.3" stroke="currentColor" /><circle cx="11.2" cy="6.2" r="1.7" fill="none" strokeWidth="1.3" stroke="currentColor" /><path d="M1.8 13.6c0-2.3 1.9-4.2 4.2-4.2s4.2 1.9 4.2 4.2" fill="none" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round" /><path d="M11.6 9.6c1.5.2 2.6 1.5 2.6 3" fill="none" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round" /></>,
  dispositivo: <><rect x="5" y="1.8" width="6" height="12.4" rx="1.2" fill="none" strokeWidth="1.3" stroke="currentColor" /><path d="M7.2 12.2h1.6" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round" /></>,
  outro: <><circle cx="8" cy="8" r="6.2" fill="none" strokeWidth="1.3" stroke="currentColor" /><circle cx="8" cy="8" r="1.6" fill="currentColor" /></>,
};

export function Glyph({ c, size = 16 }: { c: Categoria; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {paths[c]}
    </svg>
  );
}

export const laneNome: Record<Lane, string> = {
  tela: 'Tela',
  camera: 'Câmera',
  audio: 'Áudio',
};

export const categoriaNome: Record<Categoria, string> = {
  ia: 'Ferramenta de IA',
  busca: 'Busca',
  consulta: 'Consulta',
  documento: 'Documento',
  sistema: 'Sistema',
  comportamento: 'Comportamento',
  presenca: 'Presença',
  fala: 'Fala',
  prova: 'Plataforma da prova',
  pessoas: 'Pessoas',
  dispositivo: 'Dispositivo',
  outro: 'Não identificado',
};

export const nivelNome = {
  informacao: 'Informação',
  atencao: 'Atenção',
  revisar: 'Revisar',
  alta: 'Alta atenção',
} as const;

export function tc(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

export function dur(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}min ${r}s` : `${m}min`;
}


/**
 * Rótulo curto para a faixa ampliada. Precisa se sustentar sozinho, então
 * usa o mapa da análise quando existe e, quando não, tira o sufixo do título
 * em vez de cortá-lo no meio de uma frase.
 */
export function rotuloDe(ev: Evento, mapa?: Record<string, string>) {
  const pronto = mapa?.[ev.id];
  if (pronto) return pronto;
  const limpo = ev.titulo.replace(/ em primeiro plano$/i, '').trim();
  return limpo.length > 18 ? limpo.split(/\s+/).slice(0, 2).join(' ') : limpo;
}
