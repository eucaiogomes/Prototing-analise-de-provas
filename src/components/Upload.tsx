import { useRef, useState } from 'react';
import type { Evento, ItemManifesto, Lane } from '../data/tipos';
import type { Job } from '../lib/jobs';
import { laneNome } from './Glyph';

export type Fase = 'ocioso' | 'analisando' | 'concluido';

export interface Arquivo {
  nome: string;
  tamanho: number;
}

interface Props {
  fase: Fase;
  progresso: number;
  arquivo: Arquivo | null;
  eventos: Evento[];
  duracao: number;
  duracaoRotulo: string;
  totalEventos: number;
  paraRevisar: number;
  analises: ItemManifesto[];
  jobs: Job[];
  etapa: string;
  erro: string | null;
  onIniciar: (f: File) => void;
  onEscolher: (slug: string) => void;
  onAbrirJob: (j: Job) => void;
  onReiniciar: () => void;
}

/* As faixas que o pipeline entrega hoje. O áudio é opt-in: num exame com
   avaliador na chamada, fala é o esperado e o detector não separa locutores. */
const lanes: Lane[] = ['tela', 'camera'];

const rotuloEstado: Record<Job['estado'], string> = {
  pendente: 'na fila',
  processando: 'analisando',
  concluido: 'pronto',
  erro: 'falhou',
};

function minutos(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m || 1}min`;
}

function tamanho(bytes: number) {
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function Upload({
  fase, progresso, arquivo, eventos, duracao, duracaoRotulo,
  totalEventos, paraRevisar, analises, jobs, etapa, erro,
  onIniciar, onEscolher, onAbrirJob, onReiniciar,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);

  function receber(f: File | undefined) {
    if (f) onIniciar(f);
  }

  /* O envio ocupa os primeiros 20% da barra e a análise o resto. A leitura da
     tela — a etapa que a varredura ilustra — cai entre 44% e 80% do total. */
  const varredura = Math.min(1, Math.max(0, (progresso - 44) / 36));

  /* ── Concluído: encolhe para uma barra e cede o espaço ao resultado ── */
  if (fase === 'concluido' && arquivo) {
    return (
      <section className="border-b border-rule bg-surface px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <svg className="size-5 shrink-0 text-signal-ink" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="8.6" stroke="currentColor" strokeWidth="1.4" />
              <path d="m6.3 10.3 2.5 2.5 5-5.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="min-w-0 text-[13.5px]">
              <span className="block truncate font-500 text-ink">{arquivo.nome}</span>
              <span className="text-mute">
                {duracaoRotulo} de gravação
                {arquivo.tamanho > 0 && `, ${tamanho(arquivo.tamanho)}`}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-7">
            <p className="text-[13.5px] text-mute">
              <span className="tc font-600 text-ink">{totalEventos}</span> eventos,{' '}
              <span className="tc font-600 text-signal-ink">{paraRevisar}</span> para revisar
            </p>
            <button
              onClick={onReiniciar}
              className="rounded-sm border border-rule px-3 py-1.5 text-[13px] text-mute transition-colors hover:border-calm hover:text-calm"
            >
              Enviar outra gravação
            </button>
          </div>
        </div>
      </section>
    );
  }

  const analisando = fase === 'analisando';

  return (
    <section className="flex min-h-[calc(100svh-49px)] items-center px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="display text-[clamp(1.6rem,4.2vw,2.35rem)] text-ink">
          {analisando ? 'Analisando a gravação' : 'Envie a gravação da avaliação'}
        </h1>
        <p className="mt-2.5 max-w-[60ch] text-[14.5px] leading-relaxed text-mute">
          {analisando
            ? 'Você não precisa acompanhar. Ao terminar, o resultado aparece logo abaixo.'
            : 'Um arquivo com a gravação da tela, a câmera do candidato e o áudio. MP4 ou MKV, até 4 horas.'}
        </p>

        {/* ── A zona de envio já mostra as faixas que o resultado vai ter ── */}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!analisando) setSobre(true); }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            if (!analisando) receber(e.dataTransfer.files[0]);
          }}
          aria-busy={analisando}
          className={`mt-7 rounded-lg border bg-surface px-5 py-6 transition-colors sm:px-7 ${
            sobre ? 'border-calm bg-calm/5' : 'border-rule'
          }`}
        >
          <div className="space-y-2">
            {lanes.map((lane) => (
              <div key={lane} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-right text-[12px] text-mute sm:w-16">
                  {laneNome[lane]}
                </span>
                <div className="relative h-7 flex-1 overflow-hidden rounded-sm bg-tint">
                  {/* trecho já analisado */}
                  <div
                    className="absolute inset-y-0 left-0 bg-calm/12 transition-[width] duration-300 ease-linear"
                    style={{ width: `${varredura * 100}%` }}
                  />
                  {/* linha de varredura */}
                  {analisando && varredura > 0 && varredura < 1 && (
                    <div
                      className="absolute inset-y-0 w-px bg-calm transition-[left] duration-300 ease-linear"
                      style={{ left: `${varredura * 100}%` }}
                    />
                  )}
                  {/* eventos aparecem conforme a varredura passa por eles */}
                  {eventos
                    .filter((ev) => ev.lane === lane && ev.t / duracao <= varredura)
                    .map((ev) => (
                      <span
                        key={ev.id}
                        className={`mk mk-${ev.nivel}`}
                        style={{ left: `${(ev.t / duracao) * 100}%` }}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>

          {analisando ? (
            <div className="mt-6 border-t border-rule pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="text-[13.5px] text-ink" aria-live="polite">
                  {etapa}
                </p>
                <p
                  className="tc text-[13.5px] font-600 text-calm"
                  role="progressbar"
                  aria-valuenow={Math.round(progresso)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progresso da análise"
                >
                  {Math.round(progresso)}%
                </p>
              </div>
              {arquivo && (
                <p className="mt-1.5 truncate text-[12.5px] text-mute">
                  {arquivo.nome} · {tamanho(arquivo.tamanho)}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 border-t border-rule pt-6">
              <p className="text-[14px] text-mute">Arraste o arquivo aqui</p>
              <span className="text-[13px] text-mute/70">ou</span>
              <button
                onClick={() => input.current?.click()}
                className="rounded-md bg-signal px-5 py-2.5 text-[14px] font-700 text-ink transition-[filter,transform] hover:brightness-105 active:translate-y-px"
              >
                Escolher arquivo
              </button>
              <input
                ref={input}
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(e) => receber(e.target.files?.[0])}
              />
            </div>
          )}
        </div>

        {erro && (
          <p className="mt-3 rounded-sm border border-signal/40 bg-signal/8 px-3 py-2 text-[13px] text-signal-ink">
            {erro}
          </p>
        )}

        {!analisando && (
          <>
            {/* ── Gravações já enviadas, com o estado que o worker reportou ── */}
            {jobs.length > 0 && (
              <div className="mt-8 border-t border-rule pt-6">
                <h2 className="font-display text-[13.5px] font-600 text-ink">
                  Gravações enviadas
                </h2>
                <ul className="mt-3 space-y-px">
                  {jobs.map((j) => {
                    const pronto = j.estado === 'concluido' && j.analiseUrl;
                    return (
                      <li key={j.id}>
                        <button
                          disabled={!pronto}
                          onClick={() => onAbrirJob(j)}
                          className={`flex w-full flex-wrap items-baseline gap-x-5 gap-y-1 rounded-sm px-3 py-2.5 text-left transition-colors ${
                            pronto ? 'hover:bg-tint' : 'cursor-default'
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                            {j.arquivo}
                          </span>
                          <span className="tc text-[12.5px] text-mute">
                            {tamanho(j.tamanho)}
                          </span>
                          <span
                            className={`text-[12.5px] ${
                              j.estado === 'erro' ? 'text-signal-ink' : 'text-mute'
                            }`}
                          >
                            {j.estado === 'erro' ? j.erro ?? 'Falhou' : j.etapa}
                          </span>
                          <span className={`chip chip-${j.estado}`}>{rotuloEstado[j.estado]}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {jobs.some((j) => j.estado === 'pendente') && (
                  <p className="mt-3 px-3 text-[12.5px] leading-relaxed text-mute">
                    Gravação na fila. Ela só começa a ser analisada quando o worker
                    estiver de pé — é ele que tem o ffmpeg.
                  </p>
                )}
              </div>
            )}

            {analises.length > 0 && (
              <div className="mt-8 border-t border-rule pt-6">
                <h2 className="font-display text-[13.5px] font-600 text-ink">
                  Análises já processadas
                </h2>
                <ul className="mt-3 space-y-px">
                  {analises.map((a) => (
                    <li key={a.slug}>
                      <button
                        onClick={() => onEscolher(a.slug)}
                        className="flex w-full flex-wrap items-baseline gap-x-5 gap-y-1 rounded-sm px-3 py-2.5 text-left transition-colors hover:bg-tint"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                          {a.arquivo}
                        </span>
                        <span className="tc text-[12.5px] text-mute">{minutos(a.duracao)}</span>
                        <span className="text-[12.5px] text-mute">
                          <span className="tc text-ink">{a.eventos}</span> eventos,{' '}
                          <span className="tc text-signal-ink">{a.paraRevisar}</span> para revisar
                        </span>
                        <span className="rounded-sm border border-rule px-1.5 py-px text-[11px] text-mute">
                          {a.origem === 'pipeline' ? 'modelo' : 'manual'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
