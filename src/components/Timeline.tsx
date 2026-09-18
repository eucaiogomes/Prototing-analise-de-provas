import type { Cluster, Evento, Lane } from '../data/tipos';
import { Glyph, laneNome, rotuloDe, tc } from './Glyph';

interface Props {
  eventos: Evento[];
  clusters: Cluster[];
  duracao: number;
  sel: string | null;
  onSel: (id: string) => void;
  janela: { inicio: number; fim: number };
  onJanela: (j: { inicio: number; fim: number }) => void;
  rotulos?: Record<string, string>;
}

const TODAS: Lane[] = ['tela', 'camera', 'audio'];

/* Largura estimada de um rótulo, em % da faixa. Serve só para decidir
   em qual altura o rótulo cabe sem encostar no vizinho. */
const LARGURA_ROTULO = 11;
const ALTURAS = [0, 1, 2];

export function Timeline({ eventos, clusters, duracao, sel, onSel, janela, onJanela, rotulos }: Props) {
  const pct = (t: number) => (t / duracao) * 100;
  const larguraJanela = janela.fim - janela.inicio;

  const ticks = Array.from({ length: Math.floor(duracao / 1800) + 1 }, (_, i) => i * 1800)
    .filter((t) => pct(t) < 94); // o total já é rotulado na ponta direita

  function moverJanela(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * duracao;
    const inicio = Math.max(0, Math.min(duracao - larguraJanela, t - larguraJanela / 2));
    onJanela({ inicio, fim: inicio + larguraJanela });
  }

  /* Sequências próximas ganham alturas diferentes para os rótulos não colidirem. */
  const ocupadoClusters: number[] = [];
  const linhaCluster = clusters.map((c) => {
    const p = pct((c.inicio + c.fim) / 2);
    let l = 0;
    while (ocupadoClusters[l] !== undefined && p - 14 < ocupadoClusters[l]) l++;
    ocupadoClusters[l] = p + 14;
    return l;
  });
  const alturaClusters = clusters.length ? Math.max(...linhaCluster) + 1 : 1;

  /* Uma faixa vazia que nunca preenche é ruído: se a análise não cobriu áudio,
     mostrar a raia de áudio sugere que não houve nada, e não que não se olhou. */
  const lanes = TODAS.filter((l) => eventos.some((e) => e.lane === l));

  const noRecorte = eventos
    .filter((ev) => ev.t >= janela.inicio && ev.t <= janela.fim)
    .sort((a, b) => a.t - b.t);

  // O marcador fica sempre sobre o eixo; só o rótulo desce de altura
  // quando o anterior ainda ocupa aquele espaço.
  const ocupadoAte = [-Infinity, -Infinity, -Infinity];
  const alturaDe = noRecorte.map((ev) => {
    const p = ((ev.t - janela.inicio) / larguraJanela) * 100;
    let a = ALTURAS.findIndex((i) => p - LARGURA_ROTULO / 2 >= ocupadoAte[i]);
    if (a === -1) a = 2;
    ocupadoAte[a] = p + LARGURA_ROTULO / 2;
    return a;
  });
  const alturaMax = alturaDe.length ? Math.max(...alturaDe) : 0;

  return (
    <section className="border-y border-rule/70">
      {/* ── As 3h07 inteiras. A proporção é a mensagem. ── */}
      <div className="px-5 pt-7 pb-6 sm:px-8">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-[15px] font-600 tracking-tight">Linha do tempo</h2>
          <p className="text-[12.5px] text-mute">Clique para mover o recorte</p>
        </div>

        <div className="relative" onClick={moverJanela} role="presentation">
          <div className="cursor-crosshair select-none">
            {lanes.map((lane) => (
              <div key={lane} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-right text-[12px] text-mute sm:w-16">
                  {laneNome[lane]}
                </span>
                <div className="lane-track relative h-8 flex-1 border-y border-rule/40">
                  {eventos
                    .filter((ev) => ev.lane === lane)
                    .map((ev) => (
                      <span
                        key={ev.id}
                        className={`mk mk-${ev.nivel} ${
                          sel === ev.id ? 'ring-2 ring-calm ring-offset-2 ring-offset-canvas' : ''
                        }`}
                        style={{ left: `${pct(ev.t)}%` }}
                        title={`${tc(ev.t)} — ${ev.titulo}`}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Recorte ativo, alinhado à mesma faixa das lanes */}
          <div className="pointer-events-none absolute inset-0 ml-14 pl-3 sm:ml-16">
            <div className="relative h-full">
              <div
                className="absolute inset-y-0 border-x-2 border-calm bg-calm/12"
                style={{
                  left: `${pct(janela.inicio)}%`,
                  width: `${Math.max(pct(larguraJanela), 0.4)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Régua e marcação dos agrupamentos, no mesmo alinhamento */}
        <div className="ml-14 pl-3 sm:ml-16">
          <div className="relative h-5 overflow-hidden">
            {ticks.map((t, i) => (
              <span
                key={t}
                className={`tc absolute top-1 text-[11px] text-mute/80 ${
                  i % 2 ? 'hidden sm:inline' : ''
                }`}
                style={{ left: `${pct(t)}%`, transform: t === 0 ? 'none' : 'translateX(-50%)' }}
              >
                {tc(t)}
              </span>
            ))}
            <span className="tc absolute top-1 right-0 text-[11px] text-mute/80">{tc(duracao)}</span>
          </div>

          {/* Escalona os rótulos: sequências próximas se encavalariam numa linha só. */}
          <div className="relative overflow-hidden" style={{ height: 14 + alturaClusters * 28 }}>
            {clusters.map((c, i) => (
              <button
                key={c.id}
                onClick={() => onJanela({ inicio: c.inicio - 20, fim: c.fim + 20 })}
                className="group absolute flex -translate-x-1/2 flex-col items-center"
                style={{
                  left: `${pct((c.inicio + c.fim) / 2)}%`,
                  top: `${linhaCluster[i] * 28}px`,
                }}
                title={c.resumo}
              >
                <span className="h-2 w-px bg-signal/60" />
                <span className="whitespace-nowrap rounded-sm border border-signal/40 bg-signal/12 px-2 py-[3px] text-[11.5px] font-500 text-signal-ink transition-colors group-hover:bg-signal/22">
                  {c.titulo}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recorte ampliado: a única escala em que os eventos são legíveis ── */}
      <div className="border-t border-rule/70 bg-tint px-5 py-6 sm:px-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="font-display text-[15px] font-600 tracking-tight">
            Recorte{' '}
            <span className="tc font-sans font-500 text-calm">
              {tc(janela.inicio)} — {tc(janela.fim)}
            </span>
          </h3>
          <p className="text-[12.5px] text-mute">
            {noRecorte.length === 0
              ? 'Nenhum evento neste intervalo'
              : `${noRecorte.length} ${noRecorte.length === 1 ? 'evento' : 'eventos'}`}
          </p>
        </div>

        <div className="relative overflow-hidden" style={{ height: 24 + (alturaMax + 1) * 38 + 4 }}>
          <div className="absolute inset-x-0 top-[9px] h-px bg-rule" />

          {noRecorte.map((ev, i) => {
            const p = Math.min(97, Math.max(3, ((ev.t - janela.inicio) / larguraJanela) * 100));
            const altura = alturaDe[i];
            const topoRotulo = 24 + altura * 38;
            const ativo = sel === ev.id;

            return (
              <div key={ev.id} className="absolute inset-y-0" style={{ left: `${p}%` }}>
                {/* conector do eixo até o rótulo */}
                <span
                  className="absolute left-0 top-[9px] w-px -translate-x-1/2 bg-rule"
                  style={{ height: `${topoRotulo - 9}px` }}
                />
                {/* marcador, sempre sobre o eixo */}
                <span
                  className={`mk mk-${ev.nivel} ${
                    ativo ? 'ring-2 ring-calm ring-offset-2 ring-offset-canvas' : ''
                  }`}
                  style={{ left: 0, top: '9px' }}
                />
                <button
                  onClick={() => onSel(ev.id)}
                  className="absolute w-16 -translate-x-1/2 text-center sm:w-24"
                  style={{ top: `${topoRotulo}px` }}
                >
                  <span className={`tc block text-[11.5px] ${ativo ? 'text-calm' : 'text-mute'}`}>
                    {tc(ev.t)}
                  </span>
                  <span
                    className={`mt-0.5 flex items-center justify-center gap-1 text-[11.5px] leading-tight ${
                      ativo ? 'text-ink' : 'text-mute'
                    }`}
                  >
                    <Glyph c={ev.categoria} size={12} />
                    {rotuloDe(ev, rotulos)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
