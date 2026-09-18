import { upload } from '@vercel/blob/client';

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

/**
 * Sobe o MP4 direto do navegador para o Blob.
 *
 * O arquivo não passa pela função da Vercel — ela só assina o token. Acima de
 * 100 MB o SDK parte o arquivo em pedaços sozinho, que é o que torna possível
 * subir uma gravação de 3 horas sem estourar limite nenhum.
 */
export async function enviarGravacao(
  arquivo: File,
  aoProgredir: (fracao: number) => void
): Promise<string> {
  const blob = await upload(`gravacoes/${Date.now()}-${arquivo.name}`, arquivo, {
    access: 'public',
    handleUploadUrl: '/api/upload',
    clientPayload: import.meta.env.VITE_CODIGO_ENVIO ?? '',
    multipart: true,
    onUploadProgress: ({ percentage }) => aoProgredir(percentage / 100),
  });
  return blob.url;
}

export async function criarJob(dados: {
  arquivo: string;
  tamanho: number;
  videoUrl: string;
  assinatura?: string | null;
  regras?: string | null;
}): Promise<Job> {
  const r = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? `Falha ao criar o job (${r.status}).`);
  return r.json();
}

export async function lerJob(id: string): Promise<Job> {
  const r = await fetch(`/api/jobs?id=${id}&t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Não foi possível ler o andamento (${r.status}).`);
  return r.json();
}

export async function listarJobs(): Promise<Job[]> {
  const r = await fetch(`/api/jobs?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return [];
  return r.json();
}

/**
 * Acompanha o job até acabar.
 *
 * Vale lembrar que o worker é quem escreve o estado: se ele estiver parado, o
 * job fica "pendente" para sempre e é isso que a interface deve mostrar — e
 * não um progresso inventado.
 */
export function acompanhar(
  id: string,
  aoMudar: (j: Job) => void,
  intervalo = 2500
): () => void {
  let vivo = true;
  (async () => {
    while (vivo) {
      try {
        const job = await lerJob(id);
        if (!vivo) return;
        aoMudar(job);
        if (job.estado === 'concluido' || job.estado === 'erro') return;
      } catch {
        /* rede oscila; a próxima volta tenta de novo */
      }
      await new Promise((r) => setTimeout(r, intervalo));
    }
  })();
  return () => {
    vivo = false;
  };
}
