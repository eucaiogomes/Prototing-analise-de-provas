/* Converte observações por quadro em eventos com duração, nível e agrupamento.
   Tudo aqui é determinístico: o modelo descreve, esta camada organiza. */

const NIVEL_POR_CATEGORIA = {
  ia: 'revisar',
  busca: 'revisar',
  consulta: 'atencao',
  documento: 'atencao',
  sistema: 'informacao',
  prova: 'informacao',
  outro: 'informacao',
};

/* O modelo nunca conclui. A leitura possível é template por categoria,
   para que a mesma observação produza sempre a mesma ressalva. */
const SIGNIFICADO = {
  ia: 'Ferramenta de IA conversacional em primeiro plano durante a prova. A gravação não liga esse uso a nenhuma questão específica.',
  busca: 'Busca externa durante a prova. Verifique no trecho se o termo pesquisado se relaciona ao conteúdo avaliado.',
  consulta: 'Material de referência online. Pode ser consulta autorizada — as regras da certificação definem.',
  documento: 'Documento aberto durante a prova. Pode ser material de apoio permitido.',
  sistema: 'Ajuste de ambiente ou aplicativo do sistema. Sem relação aparente com o conteúdo da avaliação.',
  prova: 'A própria plataforma de avaliação em primeiro plano.',
  outro: 'Conteúdo não identificado. Confira o trecho para decidir se é relevante.',
};

const LANE = { ia: 'tela', busca: 'tela', consulta: 'tela', documento: 'tela', sistema: 'tela', prova: 'tela', outro: 'tela' };

const chave = (q) => `${q.tela_categoria}::${(q.tela_app || '').trim().toLowerCase()}`;

export function montarEventos(quadros, { duracao, margemClipe = 7, regras = null } = {}) {
  /* Com as regras em mãos o relatório para de hesitar: o que a instituição
     autoriza vira informação, o que ela proíbe sobe de prioridade. Sem regras,
     tudo segue com a ressalva de que não se sabe. */
  const nivelDe = (cat) => {
    if (regras?.permitido?.[cat]) return 'informacao';
    if (regras?.proibido?.[cat]) return 'alta';
    if (regras?.neutro?.[cat]) return 'informacao';
    return NIVEL_POR_CATEGORIA[cat] ?? 'informacao';
  };
  const significadoDe = (cat) => {
    if (regras?.permitido?.[cat]) return `${regras.permitido[cat]} Registrado para o histórico, sem indicação de problema.`;
    if (regras?.proibido?.[cat]) return `${regras.proibido[cat]} Confira o trecho antes de qualquer conclusão — a decisão é de quem revisa.`;
    if (regras?.neutro?.[cat]) return regras.neutro[cat];
    return SIGNIFICADO[cat] ?? SIGNIFICADO.outro;
  };
  const ordenados = [...quadros].sort((a, b) => a.instante - b.instante);
  const eventos = [];

  // ── Tela: trechos contíguos com o mesmo app viram um evento só ──
  let atual = null;
  for (let i = 0; i < ordenados.length; i++) {
    const q = ordenados[i];
    const k = chave(q);
    if (!atual || atual.k !== k) {
      if (atual) atual.fim = q.instante;
      atual = { k, inicio: q.instante, fim: q.instante, q };
      eventos.push(atual);
    } else {
      atual.fim = q.instante;
    }
  }
  if (atual) atual.fim = Math.min(duracao, atual.fim + 15);

  const deTela = eventos.map((e, i) => {
    const cat = e.q.tela_categoria;
    return {
      id: `t${String(i + 1).padStart(2, '0')}`,
      t: Math.round(e.inicio),
      duracao: Math.max(5, Math.round(e.fim - e.inicio)),
      lane: LANE[cat] ?? 'tela',
      categoria: cat,
      nivel: nivelDe(cat),
      titulo: tituloDe(e.q),
      observado: e.q.tela_descricao + (e.q.tela_url ? ` Barra de endereço: ${e.q.tela_url}.` : ''),
      significado: significadoDe(cat),
      fonte: `Quadro da gravação de tela, ${hhmmss(e.inicio)}`,
      confianca: e.q.confianca,
      clipeInicio: Math.max(0, Math.round(e.inicio) - margemClipe),
    };
  });

  // ── Câmera: só o que é observável, sem inferir intenção ──
  const deCamera = [];
  let n = 0;
  for (const q of ordenados) {
    if (!q.camera_visivel) continue;
    let achado = null;
    if (q.camera_pessoas > 1) {
      achado = { categoria: 'pessoas', nivel: 'alta', titulo: `${q.camera_pessoas} pessoas no enquadramento`,
        significado: 'Mais de uma pessoa no ambiente. Pode haver motivo legítimo — confira o trecho.' };
    } else if (q.camera_dispositivo_visivel) {
      achado = { categoria: 'dispositivo', nivel: 'revisar', titulo: 'Dispositivo à vista',
        significado: 'Aparelho visível no enquadramento. Pode ser permitido pelas regras da certificação.' };
    } else if (q.camera_pessoas === 0) {
      achado = { categoria: 'presenca', nivel: 'revisar', titulo: 'Sem ninguém no enquadramento',
        significado: 'Intervalo sem supervisão visual. Pode ser pausa autorizada.' };
    }
    if (!achado) continue;
    deCamera.push({
      id: `c${String(++n).padStart(2, '0')}`,
      t: Math.round(q.instante),
      duracao: 10,
      lane: 'camera',
      ...achado,
      observado: q.camera_observacao || achado.titulo,
      fonte: `Quadro da câmera, ${hhmmss(q.instante)}`,
      confianca: q.confianca,
      clipeInicio: Math.max(0, Math.round(q.instante) - margemClipe),
    });
  }

  return [...deTela, ...deCamera].sort((a, b) => a.t - b.t);
}

/* Uma sequência é um conjunto de trocas de contexto próximas. É o que o
   produto chama de correlação: eventos isolados são pontos, sequências são vãos. */
export function montarClusters(eventos, { janela = 180, minimo = 2 } = {}) {
  // Uma sequência se define pelos eventos externos, mas o retorno à prova entre
  // eles faz parte da correlação — é justamente o "saiu, consultou, voltou".
  const externos = eventos.filter((e) => e.categoria !== 'prova' && e.nivel !== 'informacao');

  const grupos = [];
  let grupo = [];
  for (const e of externos) {
    if (!grupo.length || e.t - grupo[grupo.length - 1].t <= janela) grupo.push(e);
    else { grupos.push(grupo); grupo = [e]; }
  }
  if (grupo.length) grupos.push(grupo);

  const clusters = [];
  grupos.filter((g) => g.length >= minimo).forEach((g, i) => {
    const id = `s${i + 1}`;
    const inicio = g[0].t;
    const fim = g[g.length - 1].t + g[g.length - 1].duracao;

    // Tudo que cai dentro do vão entra na sequência, inclusive os retornos.
    const dentro = eventos.filter((e) => e.t >= inicio && e.t <= fim);
    for (const e of dentro) {
      e.cluster = id;
      if (e.categoria === 'ia' && e.nivel === 'revisar') e.nivel = 'alta';
    }

    const nomes = [...new Set(dentro.map((e) => e.titulo))];
    clusters.push({
      id, inicio, fim,
      titulo: `${dentro.length} trocas de contexto em ${duracaoCurta(fim - inicio)}`,
      resumo: `Entre ${hhmmss(inicio)} e ${hhmmss(fim)} a gravação passa por ${nomes.join(', ')}.`,
    });
  });
  return clusters;
}

const GENERICOS = new Set([
  'busca', 'prova', 'ia', 'consulta', 'documento', 'sistema', 'outro',
  'navegador', 'google chrome', 'microsoft edge', 'chrome', 'edge', 'firefox',
]);

const ROTULO_CATEGORIA = {
  busca: 'Mecanismo de busca',
  prova: 'Plataforma da prova',
  ia: 'Ferramenta de IA',
  consulta: 'Página de consulta',
  documento: 'Documento aberto',
  sistema: 'Aplicativo do sistema',
  outro: 'Conteúdo não identificado',
};

function tituloDe(q) {
  const app = (q.tela_app || '').trim();
  // O modelo às vezes devolve a categoria no lugar do nome do serviço.
  // Nesse caso o rótulo genérico é mais honesto do que fingir um nome.
  if (!app || GENERICOS.has(app.toLowerCase())) {
    return ROTULO_CATEGORIA[q.tela_categoria] ?? ROTULO_CATEGORIA.outro;
  }
  const nome = app.charAt(0).toUpperCase() + app.slice(1);
  return `${nome} em primeiro plano`;
}

export function hhmmss(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

function duracaoCurta(s) {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m}min${r ? String(r).padStart(2, '0') : ''}` : `${r}s`;
}


const PLURAL = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

export function montarMetricas(eventos) {
  const porNivel = { alta: 0, revisar: 0, atencao: 0, informacao: 0 };
  const porLane = { tela: 0, camera: 0, audio: 0 };
  for (const e of eventos) {
    porNivel[e.nivel] = (porNivel[e.nivel] ?? 0) + 1;
    porLane[e.lane] = (porLane[e.lane] ?? 0) + 1;
  }
  return { total: eventos.length, paraRevisar: porNivel.alta + porNivel.revisar, porNivel, porLane };
}

/* O resumo é montado a partir dos próprios eventos, sem uma segunda chamada ao
   modelo: o que ele afirma já está verificado quadro a quadro. */
export function montarResumo(eventos, clusters, duracao) {
  const m = montarMetricas(eventos);
  /* Só destinos de tela entram na frase: os eventos de áudio espelham os mesmos
     nomes ("Fala durante X") e repeti-los transformaria o resumo num paredão. */
  const externos = eventos.filter(
    (e) => e.lane === 'tela' && e.categoria !== 'prova' && e.nivel !== 'informacao'
  );
  const todosNomes = [...new Set(externos.map((e) => e.titulo.replace(/ em primeiro plano$/, '')))];
  const LIMITE = 5;
  const nomes = todosNomes.slice(0, LIMITE);
  const excedente = todosNomes.length - nomes.length;

  const partes = [
    `Em ${duracaoLonga(duracao)} de gravação a análise separou ${PLURAL(m.total, 'evento', 'eventos')}, ` +
    `${PLURAL(m.paraRevisar, 'deles pede', 'deles pedem')} revisão.`,
  ];

  if (nomes.length) {
    partes.push(
      `Fora da plataforma da prova a gravação mostra ${listar(nomes)}`
      + (excedente ? `, e mais ${excedente} ${excedente === 1 ? 'destino' : 'destinos'}.` : '.')
    );
  } else {
    partes.push('A gravação não mostra saídas da plataforma da prova.');
  }

  const comFala = eventos.filter((e) => e.lane === 'audio' && e.nivel !== 'informacao').length;
  if (comFala) {
    partes.push(
      `Houve fala detectada em ${comFala} ${comFala === 1 ? 'desses momentos' : 'desses momentos'}.`
    );
  }

  if (clusters.length) {
    const c = clusters.reduce((a, b) => (b.fim - b.inicio > a.fim - a.inicio ? b : a));
    partes.push(
      `A sequência mais densa está entre ${hhmmss(c.inicio)} e ${hhmmss(c.fim)}: ${c.titulo.toLowerCase()}.`
    );
  }

  return partes.join(' ');
}

function listar(itens) {
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

function duracaoLonga(s) {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (h && m) return `${h}h${String(m).padStart(2, '0')}`;
  if (h) return `${h}h`;
  if (m) return `${m}min`;
  return `${Math.round(s)}s`;
}


/**
 * Eventos de áudio a partir dos trechos de fala.
 *
 * O Silero diz se há voz humana, e só isso — ele não separa quem fala. Por isso
 * nenhum título ou leitura aqui afirma "segunda pessoa" ou "conversa": isso
 * exigiria diarização, que é outro modelo.
 *
 * A contagem é por desvio, não por trecho. Uma conversa de um minuto sai do VAD
 * picada em dezenas de trechos, e emitir um evento para cada um afogaria a linha
 * do tempo com a mesma informação repetida. Aqui cada saída da prova rende no
 * máximo um evento de áudio, somando quanto se falou durante ela.
 */
export function montarEventosAudio(trechos, eventosTela, { minLongo = 60, minDuranteDesvio = 4, margemClipe = 7 } = {}) {
  const externos = eventosTela.filter((e) => e.categoria !== 'prova' && e.nivel !== 'informacao');
  const eventos = [];
  const usados = new Set();
  let n = 0;

  const sobreposicao = (t, e) =>
    Math.max(0, Math.min(t.fim, e.t + e.duracao) - Math.max(t.inicio, e.t));

  // ── Um evento por desvio em que houve fala ──
  for (const ext of externos) {
    const dentro = trechos.filter((t) => sobreposicao(t, ext) > 0);
    if (!dentro.length) continue;
    const falado = dentro.reduce((x, t) => x + sobreposicao(t, ext), 0);
    if (falado < minDuranteDesvio) continue;
    dentro.forEach((t) => usados.add(t));

    const inicio = Math.max(ext.t, Math.min(...dentro.map((t) => t.inicio)));
    eventos.push({
      id: `a${String(++n).padStart(2, '0')}`,
      t: Math.round(inicio),
      duracao: Math.round(Math.max(falado, 5)),
      lane: 'audio',
      categoria: 'fala',
      nivel: 'atencao',
      titulo: `Fala durante ${ext.titulo.replace(/ em primeiro plano$/i, '')}`,
      observado:
        `Cerca de ${Math.round(falado)}s de voz humana enquanto a tela mostrava `
        + `“${ext.titulo}”, entre ${hhmmss(ext.t)} e ${hhmmss(ext.t + ext.duracao)}.`,
      significado:
        'O detector aponta voz humana, mas não distingue quem fala. Pode ser o '
        + 'candidato lendo em voz alta, o avaliador, ou outra pessoa no ambiente — '
        + 'confira o trecho antes de concluir.',
      fonte: `Análise de áudio (Silero VAD), ${hhmmss(inicio)}`,
      clipeInicio: Math.max(0, Math.round(inicio) - margemClipe),
    });
  }

  // ── Falas longas que não coincidem com nenhum desvio ──
  for (const t of trechos) {
    if (usados.has(t)) continue;
    const dur = t.fim - t.inicio;
    if (dur < minLongo) continue;
    eventos.push({
      id: `a${String(++n).padStart(2, '0')}`,
      t: Math.round(t.inicio),
      duracao: Math.round(dur),
      lane: 'audio',
      categoria: 'fala',
      nivel: 'informacao',
      titulo: `Fala contínua por ${Math.round(dur)}s`,
      observado: `Voz humana detectada de ${hhmmss(t.inicio)} a ${hhmmss(t.fim)}, com a prova em primeiro plano.`,
      significado:
        'O detector aponta voz humana, mas não distingue quem fala. Falar durante '
        + 'a prova pode ser hábito de leitura em voz alta.',
      fonte: `Análise de áudio (Silero VAD), ${hhmmss(t.inicio)}`,
      clipeInicio: Math.max(0, Math.round(t.inicio) - margemClipe),
    });
  }

  return eventos.sort((a, b) => a.t - b.t);
}


const mediana = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/**
 * Eventos de câmera a partir das amostras de detecção facial.
 *
 * A referência de "olhando para a prova" sai da própria gravação: a mediana da
 * orientação ao longo de toda a sessão. Não há posição correta universal — ela
 * depende de onde a câmera está, da altura da cadeira, do monitor. Calibrar
 * pela gravação evita cravar um número que só vale para um arranjo.
 *
 * Um quadro isolado fora da referência não vira evento: só sequências
 * sustentadas, porque um movimento de cabeça de um segundo não diz nada.
 */
export function montarEventosCamera(amostras, { minAusencia = 10, minDesvio = 4, mads = 6, margemClipe = 7 } = {}) {
  const comRosto = amostras.filter((a) => a.n === 1 && a.yaw !== null && a.yaw !== undefined);
  if (comRosto.length < 8) return { eventos: [], referencia: null };

  const yaws = comRosto.map((a) => a.yaw);
  const pitches = comRosto.map((a) => a.pitch);
  const my = mediana(yaws), mp = mediana(pitches);
  const madY = Math.max(0.01, mediana(yaws.map((v) => Math.abs(v - my))));
  const madP = Math.max(0.01, mediana(pitches.map((v) => Math.abs(v - mp))));

  const classificar = (a) => {
    // 'layout' vem da amostragem: sem rosto na região, mas presente no quadro.
    if (a.classe === 'layout') return 'layout';
    if (a.n === 0) return a.classe === 'ausente' ? 'ausente' : 'layout';
    if (a.n > 1) return 'acompanhado';
    if (a.yaw === null || a.yaw === undefined) return 'indefinido';
    const desvio = Math.max(Math.abs(a.yaw - my) / madY, Math.abs(a.pitch - mp) / madP);
    return desvio > mads ? 'desviado' : 'normal';
  };

  // Agrupa amostras vizinhas com a mesma classificação.
  const corridas = [];
  for (const a of amostras) {
    const c = classificar(a);
    const ultima = corridas[corridas.length - 1];
    if (ultima && ultima.classe === c) { ultima.fim = a.t; ultima.amostras.push(a); }
    else corridas.push({ classe: c, inicio: a.t, fim: a.t, amostras: [a] });
  }

  const receita = {
    layout: {
      min: 30, nivel: 'informacao', categoria: 'presenca',
      titulo: 'Enquadramento diferente do restante da gravação',
      significado: 'O candidato aparece no quadro, mas fora da posição usual da câmera — '
        + 'normalmente a fase de abertura, antes do compartilhamento de tela. Não é ausência.',
    },
    ausente: {
      min: minAusencia, nivel: 'revisar', categoria: 'presenca',
      titulo: 'Sem ninguém no enquadramento',
      significado: 'Intervalo sem supervisão visual. Pode ser pausa autorizada — confira as regras da certificação.',
    },
    acompanhado: {
      min: minDesvio, nivel: 'alta', categoria: 'pessoas',
      titulo: 'Mais de uma pessoa no enquadramento',
      significado: 'O detector encontrou mais de um rosto. Pode ser alguém passando pelo ambiente — confira o trecho.',
    },
    desviado: {
      min: minDesvio, nivel: 'atencao', categoria: 'comportamento',
      titulo: 'Cabeça virada para fora da posição habitual',
      significado: 'A orientação da cabeça saiu da posição que o candidato manteve na maior parte da prova. '
        + 'Pode ser alongamento, leitura de material permitido ou um segundo monitor. '
        + 'O detector mede a posição da cabeça, não para onde os olhos apontam.',
    },
  };

  const eventos = [];
  let n = 0;
  for (const c of corridas) {
    const r = receita[c.classe];
    if (!r) continue;
    const dur = c.fim - c.inicio;
    if (dur < r.min) continue;
    const pico = c.amostras.reduce((a, b) =>
      (Math.abs((b.yaw ?? my) - my) > Math.abs((a.yaw ?? my) - my) ? b : a));
    eventos.push({
      id: `v${String(++n).padStart(2, '0')}`,
      t: Math.round(c.inicio),
      duracao: Math.round(Math.max(dur, 5)),
      lane: 'camera',
      categoria: r.categoria,
      nivel: r.nivel,
      titulo: r.titulo,
      observado: c.classe === 'desviado'
        ? `Orientação fora da referência por ${Math.round(dur)}s, com pico em ${hhmmss(pico.t)}.`
        : `${r.titulo} por ${Math.round(dur)}s, de ${hhmmss(c.inicio)} a ${hhmmss(c.fim)}.`,
      significado: r.significado,
      fonte: `Análise de câmera (YuNet), ${hhmmss(c.inicio)}`,
      clipeInicio: Math.max(0, Math.round(c.inicio) - margemClipe),
    });
  }

  return {
    eventos,
    referencia: { yaw: my, pitch: mp, madYaw: madY, madPitch: madP, amostras: comRosto.length, mads },
  };
}


/**
 * Eventos de objetos vistos na região da câmera.
 *
 * Só a região da câmera é analisada: no quadro inteiro o próprio
 * compartilhamento de tela é detectado como "notebook" e "tv", cobrindo a tela
 * toda. Medido nesta base — caixas de 1738x981 sobre a área da prova.
 *
 * Objetos que fazem parte de qualquer mesa de trabalho (teclado, mouse, monitor)
 * não viram evento: estariam presentes a prova inteira e só gerariam ruído.
 */
const OBJETOS_RELEVANTES = {
  celular: { nivel: 'revisar', titulo: 'Possível dispositivo móvel à vista' },
  livro: { nivel: 'atencao', titulo: 'Possível material impresso à vista' },
  'controle remoto': { nivel: 'atencao', titulo: 'Objeto de mão não identificado à vista' },
};

export function montarEventosObjetos(amostras, { minDuracao = 8, fundoVirtual = false, margemClipe = 7 } = {}) {
  const corridas = [];
  for (const a of amostras) {
    const classes = new Set((a.objetos ?? []).map((o) => o.classe).filter((c) => OBJETOS_RELEVANTES[c]));
    for (const c of classes) {
      const ultima = corridas.find((r) => r.classe === c && a.t - r.fim <= 120);
      if (ultima) { ultima.fim = a.t; ultima.picos.push(a); }
      else corridas.push({ classe: c, inicio: a.t, fim: a.t, picos: [a] });
    }
  }

  const eventos = [];
  let n = 0;
  for (const r of corridas) {
    const dur = r.fim - r.inicio;
    if (dur < minDuracao) continue;
    const cfg = OBJETOS_RELEVANTES[r.classe];
    const melhor = Math.max(...r.picos.flatMap((p) => p.objetos.filter((o) => o.classe === r.classe).map((o) => o.score)));
    eventos.push({
      id: `o${String(++n).padStart(2, '0')}`,
      t: Math.round(r.inicio),
      duracao: Math.round(Math.max(dur, 5)),
      lane: 'camera',
      categoria: 'dispositivo',
      nivel: cfg.nivel,
      titulo: cfg.titulo,
      observado: `Detecção de "${r.classe}" na região da câmera entre ${hhmmss(r.inicio)} e ${hhmmss(r.fim)}, `
        + `com confiança máxima de ${melhor.toFixed(2)}.`,
      significado: fundoVirtual
        ? 'O detector aponta um objeto, mas esta câmera usa plano de fundo virtual: '
          + 'o que está atrás do candidato é uma imagem sintética e pode enganar a detecção. '
          + 'Confira o trecho antes de qualquer conclusão.'
        : 'O detector aponta um objeto compatível com essa classe. Pode ser item permitido '
          + 'pelas regras da certificação — confira o trecho.',
      fonte: `Análise de objetos (YOLOX), ${hhmmss(r.inicio)}`,
      clipeInicio: Math.max(0, Math.round(r.inicio) - margemClipe),
    });
  }
  return eventos;
}
