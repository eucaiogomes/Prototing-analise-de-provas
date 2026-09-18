import type { Decisao, Evento, Lane, Nivel } from '../data/tipos';
import { Glyph, laneNome, nivelNome, tc } from './Glyph';

interface Props {
  eventos: Evento[];
  sel: string | null;
  onSel: (id: string) => void;
  decisoes: Record<string, { decisao: Decisao; nota: string }>;
  filtro: Lane | 'todos';
  onFiltro: (f: Lane | 'todos') => void;
  soRevisar: boolean;
  onSoRevisar: (v: boolean) => void;
}

const prioridade: Record<Nivel, number> = {
  alta: 0, revisar: 1, atencao: 2, informacao: 3,
};

export function EventList({
  eventos, sel, onSel, decisoes, filtro, onFiltro, soRevisar, onSoRevisar,
}: Props) {
  const lista = eventos
    .filter((e) => (filtro === 'todos' ? true : e.lane === filtro))
    .filter((e) => (soRevisar ? prioridade[e.nivel] <= 1 : true))
    .sort((a, b) => a.t - b.t);

  const comEventos = (['tela', 'camera', 'audio'] as Lane[])
    .filter((l) => eventos.some((e) => e.lane === l));
  const abas: (Lane | 'todos')[] = comEventos.length > 1
    ? ['todos', ...comEventos]
    : comEventos;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-rule/70 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[15px] font-600 tracking-tight">Eventos</h2>
          <span className="tc text-[12px] text-mute">{lista.length}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {abas.map((a) => (
            <button
              key={a}
              onClick={() => onFiltro(a)}
              className={`rounded-sm px-2.5 py-1 text-[12.5px] transition-colors ${
                filtro === a
                  ? 'bg-calm/10 text-calm'
                  : 'text-mute hover:bg-tint hover:text-ink'
              }`}
            >
              {a === 'todos' ? 'Todos' : laneNome[a]}
            </button>
          ))}
        </div>

        <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12.5px] text-mute">
          <input
            type="checkbox"
            checked={soRevisar}
            onChange={(e) => onSoRevisar(e.target.checked)}
            className="size-3.5 accent-[#FF7A1A]"
          />
          Apenas os que pedem revisão
        </label>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {lista.map((ev) => {
          const d = decisoes[ev.id]?.decisao ?? 'pendente';
          const ativo = sel === ev.id;
          return (
            <li key={ev.id}>
              <button
                onClick={() => onSel(ev.id)}
                aria-current={ativo}
                className={`flex w-full gap-3 border-b border-rule/40 px-5 py-3 text-left transition-colors ${
                  ativo ? 'bg-calm/8' : 'hover:bg-tint/70'
                }`}
              >
                <span className="relative mt-[5px] flex h-3 w-3 shrink-0 items-center justify-center">
                  <span className={`mk mk-${ev.nivel}`} style={{ left: '50%' }} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`tc text-[12.5px] ${ativo ? 'text-calm' : 'text-mute'}`}>
                      {tc(ev.t)}
                    </span>
                    <span className="text-mute/70"><Glyph c={ev.categoria} size={12} /></span>
                    {ev.simulado && (
                      <span className="rounded-sm border border-rule px-1 py-px text-[10.5px] text-mute">
                        exemplo
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug text-ink">
                    {ev.titulo}
                  </span>
                  <span className="mt-1 block text-[11.5px] text-mute">
                    {nivelNome[ev.nivel]}
                    {d !== 'pendente' && (
                      <span className={d === 'confirmado' ? 'text-signal-ink' : 'text-mute'}>
                        {' · '}
                        {d === 'confirmado' ? 'Confirmado' : 'Não relevante'}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {lista.length === 0 && (
          <li className="px-5 py-8 text-[13px] leading-relaxed text-mute">
            Nenhum evento com esses filtros. Desmarque “apenas os que pedem revisão”
            para ver a gravação inteira.
          </li>
        )}
      </ul>
    </div>
  );
}
