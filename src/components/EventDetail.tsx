import { useEffect, useRef } from 'react';
import type { Decisao, Evento } from '../data/tipos';
import { midia } from '../lib/analises';
import { Glyph, categoriaNome, laneNome, nivelNome, tc, dur } from './Glyph';

interface Props {
  ev: Evento;
  slug: string;
  relacionados: Evento[];
  onSel: (id: string) => void;
  decisao: { decisao: Decisao; nota: string };
  onDecisao: (d: Decisao) => void;
  onNota: (n: string) => void;
}

export function EventDetail({ ev, slug, relacionados, onSel, decisao, onDecisao, onNota }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const offset = ev.t - ev.clipeInicio; // o clipe abre alguns segundos antes do evento

  useEffect(() => {
    const v = video.current;
    if (v) { v.load(); v.currentTime = 0; }
  }, [ev.id]);

  return (
    <article className="flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="border-b border-rule/70 px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-mute">
          <span className={`mk mk-${ev.nivel} !static !translate-0`} />
          <span className={ev.nivel === 'alta' || ev.nivel === 'revisar' ? 'text-signal-ink' : ''}>
            {nivelNome[ev.nivel]}
          </span>
          <span className="h-3 w-px bg-rule" />
          <span className="flex items-center gap-1.5">
            <Glyph c={ev.categoria} size={13} />
            {categoriaNome[ev.categoria]}
          </span>
          <span className="h-3 w-px bg-rule" />
          <span>{laneNome[ev.lane]}</span>
        </div>

        <h2 className="display mt-3 text-[26px] sm:text-[31px] text-ink">{ev.titulo}</h2>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-7 gap-y-1 text-[13px]">
          <span className="tc text-calm">{tc(ev.t)}</span>
          <span className="text-mute">Duração observada {dur(ev.duracao)}</span>
          <span className="text-mute">{ev.fonte}</span>
        </div>
      </header>

      <div className="px-6 py-6 sm:px-8">
        {/* ── Evidência. Nenhuma afirmação sem o trecho que a sustenta. ── */}
        {ev.clipe ? (
          <figure className="m-0">
            <video
              ref={video}
              controls
              playsInline
              preload="metadata"
              poster={midia(slug, ev.poster)}
              className="w-full rounded border border-rule bg-black"
            >
              <source src={midia(slug, ev.clipe)} type="video/mp4" />
            </video>
            <figcaption className="mt-2.5 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-mute">
              <span>
                Trecho da gravação original, aberto {offset}s antes do evento.
              </span>
              <button
                onClick={() => {
                  const v = video.current;
                  if (v) { v.currentTime = offset; v.play(); }
                }}
                className="rounded-sm border border-rule px-2.5 py-1 text-ink transition-colors hover:border-calm hover:text-calm"
              >
                Ir para {tc(ev.t)}
              </button>
            </figcaption>
          </figure>
        ) : (
          <div className="rounded border border-dashed border-rule px-5 py-8 text-[13px] leading-relaxed text-mute">
            Este evento não tem trecho de vídeo associado. As faixas de câmera e
            áudio ainda não são analisadas quadro a quadro, então eventos delas
            entram sem evidência em vídeo.
          </div>
        )}

        {/* ── O que foi observado ≠ o que isso pode significar. ── */}
        <div className="mt-8 grid gap-7 sm:grid-cols-2">
          <section>
            <h3 className="font-display text-[13.5px] font-600 text-ink">
              O que a gravação mostra
            </h3>
            <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-ink/80">
              {ev.observado}
            </p>
          </section>
          <section>
            <h3 className="font-display text-[13.5px] font-600 text-mute">
              O que isso pode significar
            </h3>
            <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-mute">
              {ev.significado}
            </p>
          </section>
        </div>

        {relacionados.length > 0 && (
          <section className="mt-9 border-t border-rule/70 pt-6">
            <h3 className="font-display text-[13.5px] font-600 text-ink">
              Acontece dentro da mesma sequência
            </h3>
            <ol className="mt-3 space-y-px">
              {relacionados.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onSel(r.id)}
                    className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors ${
                      r.id === ev.id ? 'bg-calm/8' : 'hover:bg-tint'
                    }`}
                  >
                    <span className={`mk mk-${r.nivel} !static !translate-0 shrink-0`} />
                    <span className={`tc text-[12.5px] ${r.id === ev.id ? 'text-calm' : 'text-mute'}`}>
                      {tc(r.t)}
                    </span>
                    <span className="text-[13.5px] text-ink/85">{r.titulo}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Decisão do revisor. A ferramenta não conclui por ele. ── */}
        <section className="mt-9 border-t border-rule/70 pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-display text-[13.5px] font-600 text-ink">Sua decisão</h3>
            <span className="text-[12.5px] text-mute">
              {decisao.decisao === 'pendente' ? 'Ainda pendente' : 'Registrada'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              ['confirmado', 'Confirmar evento'],
              ['descartado', 'Marcar como não relevante'],
            ] as const).map(([v, rotulo]) => (
              <button
                key={v}
                onClick={() => onDecisao(decisao.decisao === v ? 'pendente' : v)}
                aria-pressed={decisao.decisao === v}
                className={`rounded-sm border px-3.5 py-2 text-[13px] transition-colors ${
                  decisao.decisao === v
                    ? 'border-calm bg-calm/10 text-calm'
                    : 'border-rule text-mute hover:border-mute hover:text-ink'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="text-[12.5px] text-mute">Observação do revisor</span>
            <textarea
              value={decisao.nota}
              onChange={(e) => onNota(e.target.value)}
              rows={3}
              placeholder="O que você viu no trecho e o que pesou na sua decisão."
              className="mt-1.5 w-full resize-y rounded-sm border border-rule bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed text-ink placeholder:text-mute/70 focus:border-calm focus:outline-none"
            />
          </label>
        </section>
      </div>
    </article>
  );
}
