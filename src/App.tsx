import { useEffect, useMemo, useState } from 'react';
import type { Analise, Decisao, ItemManifesto, Lane, Nivel } from './data/tipos';
import { carregarAnalise, carregarManifesto } from './lib/analises';
import { Timeline } from './components/Timeline';
import { EventList } from './components/EventList';
import { EventDetail } from './components/EventDetail';
import { Upload, type Arquivo, type Fase } from './components/Upload';
import { laneNome, nivelNome, tc } from './components/Glyph';

const niveis: Nivel[] = ['alta', 'revisar', 'atencao', 'informacao'];

/** Abre onde há o que olhar: a sequência mais densa, ou o primeiro evento relevante. */
function janelaInicial(a: Analise) {
  if (a.clusters.length) {
    const c = a.clusters.reduce((x, y) => (y.fim - y.inicio > x.fim - x.inicio ? y : x));
    return { inicio: Math.max(0, c.inicio - 20), fim: Math.min(a.gravacao.duracao, c.fim + 20) };
  }
  const alvo = a.eventos.find((e) => e.nivel !== 'informacao') ?? a.eventos[0];
  const meia = Math.max(60, a.gravacao.duracao * 0.05);
  const centro = alvo?.t ?? 0;
  return {
    inicio: Math.max(0, centro - meia),
    fim: Math.min(a.gravacao.duracao, centro + meia),
  };
}

function eventoInicial(a: Analise) {
  return (a.eventos.find((e) => e.nivel === 'alta')
    ?? a.eventos.find((e) => e.nivel === 'revisar')
    ?? a.eventos[0])?.id ?? '';
}

export default function App() {
  const [manifesto, setManifesto] = useState<ItemManifesto[]>([]);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [slug, setSlug] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);

  const [fase, setFase] = useState<Fase>('ocioso');
  const [progresso, setProgresso] = useState(0);
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);

  const [sel, setSel] = useState<string>('');
  const [janela, setJanela] = useState({ inicio: 0, fim: 60 });
  const [filtro, setFiltro] = useState<Lane | 'todos'>('todos');
  const [soRevisar, setSoRevisar] = useState(false);
  const [decisoes, setDecisoes] = useState<Record<string, { decisao: Decisao; nota: string }>>({});

  useEffect(() => {
    carregarManifesto().then(setManifesto).catch((e) => setErro(e.message));
  }, []);

  /* ?analise=<slug> abre um resultado direto, sem passar pelo envio.
     É o link que o revisor compartilha com quem precisa ver a mesma evidência. */
  useEffect(() => {
    const pedido = new URLSearchParams(window.location.search).get('analise');
    if (!pedido) return;
    carregarAnalise(pedido)
      .then((a) => {
        setAnalise(a);
        setSlug(pedido);
        setSel(eventoInicial(a));
        setJanela(janelaInicial(a));
        setArquivo({ nome: a.gravacao.arquivo, tamanho: 0 });
        setProgresso(100);
        setFase('concluido');
      })
      .catch((e) => setErro(e.message));
  }, []);

  /* A varredura só avança depois que a análise já está em mãos.
     O progresso vem do tempo decorrido, e não da contagem de ticks: o navegador
     estrangula timers em aba de segundo plano e a barra ficaria parada. */
  useEffect(() => {
    if (fase !== 'analisando' || !analise) return;
    const inicio = Date.now();
    const total = 6000;
    const id = setInterval(() => {
      setProgresso(Math.min(100, ((Date.now() - inicio) / total) * 100));
    }, 100);
    return () => clearInterval(id);
  }, [fase, analise]);

  useEffect(() => {
    if (fase === 'analisando' && progresso >= 100) setFase('concluido');
  }, [fase, progresso]);

  const ev = useMemo(
    () => analise?.eventos.find((e) => e.id === sel) ?? analise?.eventos[0],
    [analise, sel]
  );
  const decisao = decisoes[ev?.id ?? ''] ?? { decisao: 'pendente' as Decisao, nota: '' };

  const relacionados = useMemo(
    () => (ev?.cluster && analise
      ? analise.eventos.filter((e) => e.cluster === ev.cluster).sort((a, b) => a.t - b.t)
      : []),
    [ev, analise]
  );

  async function abrir(escolhido: string, origem: Arquivo | null) {
    setErro(null);
    setArquivo(origem);
    setProgresso(0);
    setFase('analisando');
    try {
      const a = await carregarAnalise(escolhido);
      setAnalise(a);
      setSlug(escolhido);
      setSel(eventoInicial(a));
      setJanela(janelaInicial(a));
      setDecisoes({});
      setFiltro('todos');
      setSoRevisar(false);
    } catch (e) {
      setErro((e as Error).message);
      setFase('ocioso');
    }
  }

  function selecionar(id: string) {
    if (!analise) return;
    setSel(id);
    const alvo = analise.eventos.find((e) => e.id === id);
    if (!alvo) return;
    if (alvo.t < janela.inicio || alvo.t > janela.fim) {
      const meia = (janela.fim - janela.inicio) / 2;
      const inicio = Math.max(0, Math.min(analise.gravacao.duracao - meia * 2, alvo.t - meia));
      setJanela({ inicio, fim: inicio + meia * 2 });
    }
  }

  function reiniciar() {
    setFase('ocioso');
    setProgresso(0);
    setArquivo(null);
    setAnalise(null);
    setSlug('');
  }

  const concluido = fase === 'concluido' && analise && ev;
  const m = analise?.metricas;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-rule bg-canvas/90 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid size-6 place-items-center rounded-sm bg-signal">
              <span className="block size-1.5 rounded-full bg-white" />
            </span>
            <span className="font-display text-[14.5px] font-700 tracking-tight">Integridade</span>
          </div>
          {concluido && (
            <p className="text-[12.5px] text-mute">
              {analise.origem === 'pipeline'
                ? `Analisada por ${analise.modelo}`
                : 'Análise montada à mão'}
            </p>
          )}
        </div>
      </header>

      <Upload
        fase={fase}
        progresso={progresso}
        arquivo={arquivo}
        eventos={analise?.eventos ?? []}
        duracao={analise?.gravacao.duracao ?? 1}
        duracaoRotulo={analise ? tc(analise.gravacao.duracao) : ''}
        totalEventos={m?.total ?? 0}
        paraRevisar={m?.paraRevisar ?? 0}
        analises={manifesto}
        erro={erro}
        onIniciar={(a) => abrir(manifesto[0]?.slug ?? '', a)}
        onEscolher={(s) => abrir(s, null)}
        onReiniciar={reiniciar}
      />

      {concluido && (
        <>
          <section className="border-b border-rule px-5 py-9 sm:px-8">
            <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-16">
              <div>
                <h2 className="font-display text-[19px] font-700 tracking-tight text-ink">
                  {analise.avaliacao?.candidato ?? analise.gravacao.arquivo}
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-mute">
                  {analise.avaliacao ? (
                    <>
                      {analise.avaliacao.prova}
                      <br />
                      {analise.avaliacao.instituicao}, {analise.avaliacao.data}
                    </>
                  ) : (
                    'A gravação não carrega os dados do candidato. Informe-os ao enviar, se quiser que apareçam aqui.'
                  )}
                </p>

                <p className="mt-5 max-w-[68ch] text-[14.5px] leading-[1.65] text-ink/80">
                  {analise.resumo}
                </p>

                {analise.fundoVirtual?.virtual && (
                  <p className="mt-5 max-w-[68ch] border-l-2 border-signal pl-3 text-[13.5px] leading-relaxed text-mute">
                    A câmera usa <span className="text-ink">plano de fundo virtual</span>. O
                    ambiente atrás do candidato é uma imagem sintética, então objetos e
                    pessoas ao fundo não são observáveis nesta gravação — a ausência de
                    detecções ali não significa que não havia nada.
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2.5">
                  {niveis.map((n) => (
                    <span key={n} className="flex items-center gap-2 text-[13px] text-mute">
                      <span className={`mk mk-${n} !static !translate-0`} />
                      <span className="tc text-ink">{m?.porNivel[n] ?? 0}</span>
                      {nivelNome[n]}
                    </span>
                  ))}
                </div>
              </div>

              <aside>
                <dl className="space-y-1.5 text-[13px]">
                  {[
                    ['Duração', tc(analise.gravacao.duracao)],
                    ...(analise.avaliacao?.questoes
                      ? [['Questões', String(analise.avaliacao.questoes)] as [string, string]]
                      : []),
                    ...(['tela', 'camera', 'audio'] as Lane[]).map(
                      (l) => [laneNome[l], String(m?.porLane[l] ?? 0)] as [string, string]
                    ),
                    ...(analise.amostragem
                      ? [['Quadros lidos', String(analise.amostragem.quadrosEnviados)] as [string, string]]
                      : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-rule pb-1.5">
                      <dt className="text-mute">{k}</dt>
                      <dd className="tc text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            </div>
          </section>

          <Timeline
            eventos={analise.eventos}
            clusters={analise.clusters}
            duracao={analise.gravacao.duracao}
            sel={sel}
            onSel={selecionar}
            janela={janela}
            onJanela={setJanela}
            rotulos={analise.rotuloCurto}
          />

          <section className="grid bg-surface lg:h-[780px] lg:grid-rows-1 lg:grid-cols-[350px_minmax(0,1fr)] lg:overflow-hidden">
            <div className="min-h-0 border-b border-rule lg:border-b-0 lg:border-r">
              <EventList
                eventos={analise.eventos}
                sel={sel}
                onSel={selecionar}
                decisoes={decisoes}
                filtro={filtro}
                onFiltro={setFiltro}
                soRevisar={soRevisar}
                onSoRevisar={setSoRevisar}
              />
            </div>

            <EventDetail
              ev={ev}
              slug={slug}
              relacionados={relacionados}
              decisao={decisao}
              onSel={selecionar}
              onDecisao={(d) => setDecisoes((s) => ({ ...s, [ev.id]: { ...decisao, decisao: d } }))}
              onNota={(n) => setDecisoes((s) => ({ ...s, [ev.id]: { ...decisao, nota: n } }))}
            />
          </section>

          <footer className="border-t border-rule px-5 py-8 sm:px-8">
            <p className="max-w-[78ch] text-[13px] leading-relaxed text-mute">
              Esta análise organiza o que a gravação mostra e separa os trechos que
              merecem revisão. Ela não conclui se houve irregularidade — essa leitura
              é de quem revisa, com as regras da certificação em mãos. A faixa de
              áudio detecta voz, não quem fala; a de câmera mede a posição da
              cabeça, não para onde os olhos apontam.
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
