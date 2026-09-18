import { put, list, del } from '@vercel/blob';

/**
 * A fila.
 *
 * Um job é um JSON em `jobs/<id>.json` no Blob. Não há banco: o estado cabe
 * num arquivo e o Blob já é a única dependência que o projeto precisa ter.
 *
 *   GET    /api/jobs          lista os jobs, mais novo primeiro
 *   GET    /api/jobs?id=X     um job
 *   POST   /api/jobs          cria (o navegador chama após subir o vídeo)
 *   PATCH  /api/jobs          o worker informa progresso e resultado
 *   DELETE /api/jobs?id=X     remove o job e o vídeo
 */

export interface Job {
  id: string;
  criado: string;
  arquivo: string;
  tamanho: number;
  videoUrl: string;
  assinatura: string | null;
  regras: string | null;
  estado: 'pendente' | 'processando' | 'concluido' | 'erro';
  etapa: string;
  progresso: number;
  analiseUrl: string | null;
  erro: string | null;
  iniciado: string | null;
  terminado: string | null;
}

const PREFIXO = 'jobs/';
const caminho = (id: string) => `${PREFIXO}${id}.json`;

/* O Blob fica atrás de CDN e um job muda a cada poucos segundos. Sem o
   parâmetro único a leitura devolve a versão anterior por até 60s, e a barra
   de progresso congelaria. */
async function ler(url: string): Promise<Job | null> {
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  return r.ok ? ((await r.json()) as Job) : null;
}

async function gravar(job: Job) {
  await put(caminho(job.id), JSON.stringify(job), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
  return job;
}

async function achar(id: string) {
  const { blobs } = await list({ prefix: caminho(id), limit: 1 });
  return blobs[0] ? ler(blobs[0].url) : null;
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  try {
    if (request.method === 'GET') {
      if (id) {
        const job = await achar(id);
        return job
          ? Response.json(job)
          : Response.json({ erro: 'Job não encontrado.' }, { status: 404 });
      }

      const { blobs } = await list({ prefix: PREFIXO, limit: 100 });
      const jobs = (await Promise.all(blobs.map((b) => ler(b.url))))
        .filter((j): j is Job => j !== null)
        .sort((a, b) => b.criado.localeCompare(a.criado));
      return Response.json(jobs);
    }

    if (request.method === 'POST') {
      const corpo = await request.json();
      if (!corpo.videoUrl || !corpo.arquivo) {
        return Response.json({ erro: 'videoUrl e arquivo são obrigatórios.' }, { status: 400 });
      }
      const job: Job = {
        id: crypto.randomUUID().slice(0, 8),
        criado: new Date().toISOString(),
        arquivo: String(corpo.arquivo),
        tamanho: Number(corpo.tamanho) || 0,
        videoUrl: String(corpo.videoUrl),
        assinatura: corpo.assinatura ?? null,
        regras: corpo.regras ?? null,
        estado: 'pendente',
        etapa: 'Na fila',
        progresso: 0,
        analiseUrl: null,
        erro: null,
        iniciado: null,
        terminado: null,
      };
      return Response.json(await gravar(job), { status: 201 });
    }

    /* Só o worker escreve progresso e resultado. Sem este segredo qualquer um
       poderia injetar uma análise falsa num job alheio. */
    if (request.method === 'PATCH') {
      if (request.headers.get('x-worker-secret') !== process.env.WORKER_SECRET) {
        return Response.json({ erro: 'Não autorizado.' }, { status: 401 });
      }
      const corpo = await request.json();
      const job = await achar(corpo.id);
      if (!job) return Response.json({ erro: 'Job não encontrado.' }, { status: 404 });

      for (const campo of ['estado', 'etapa', 'progresso', 'analiseUrl', 'erro'] as const) {
        if (corpo[campo] !== undefined) (job as Record<string, unknown>)[campo] = corpo[campo];
      }
      if (corpo.estado === 'processando' && !job.iniciado) job.iniciado = new Date().toISOString();
      if (corpo.estado === 'concluido' || corpo.estado === 'erro') {
        job.terminado = new Date().toISOString();
      }
      return Response.json(await gravar(job));
    }

    if (request.method === 'DELETE') {
      if (!id) return Response.json({ erro: 'id é obrigatório.' }, { status: 400 });
      const job = await achar(id);
      if (job?.videoUrl) await del(job.videoUrl).catch(() => {});
      const { blobs } = await list({ prefix: caminho(id), limit: 1 });
      if (blobs[0]) await del(blobs[0].url);
      return Response.json({ ok: true });
    }

    return Response.json({ erro: 'Método não suportado.' }, { status: 405 });
  } catch (erro) {
    return Response.json({ erro: (erro as Error).message }, { status: 500 });
  }
}
