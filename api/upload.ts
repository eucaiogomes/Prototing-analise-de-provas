import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Entrega ao navegador um token para subir o MP4 direto ao Blob.
 *
 * O arquivo não passa por aqui: função da Vercel aceita 4,5 MB de corpo e uma
 * gravação de 3h tem centenas de megabytes. O token é a única coisa que
 * trafega por esta rota.
 *
 * A Vercel pode entregar um IncomingMessage do Node (sem .json()) ou um
 * Request da Web API dependendo do runtime. Este handler aceita os dois.
 */
export default async function handler(req: Request | IncomingMessage, res?: ServerResponse) {
  /* Normaliza para Web API Request caso receba IncomingMessage do Node.js */
  let request: Request;
  if (typeof (req as Request).json === 'function') {
    request = req as Request;
  } else {
    const node = req as IncomingMessage;
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      node.on('data', (c: Buffer) => chunks.push(c));
      node.on('end', resolve);
      node.on('error', reject);
    });
    const rawBody = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [k, v] of Object.entries(node.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    request = new Request(`https://${node.headers.host}${node.url}`, {
      method: node.method ?? 'POST',
      headers,
      body: rawBody,
    });
  }

  const body = (await request.clone().json()) as HandleUploadBody;

  try {
    const resposta = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_caminho, payloadDoCliente) => {
        /* Porta de entrada mínima. O segredo viaja no bundle do navegador,
           então isto barra abuso casual, não um atacante decidido. Trocar por
           autenticação de verdade antes de expor a clientes. */
        const esperado = process.env.CODIGO_ENVIO;
        if (esperado && payloadDoCliente !== esperado) {
          throw new Error('Código de envio inválido.');
        }

        return {
          allowedContentTypes: [
            'video/mp4',
            'video/x-matroska',
            'video/quicktime',
            'video/webm',
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 8 * 1024 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {
        /* O job é criado pelo próprio navegador em POST /api/jobs assim que o
           upload termina. Não há o que fazer aqui. */
      },
    });

    return Response.json(resposta);
  } catch (erro) {
    return Response.json({ erro: (erro as Error).message }, { status: 400 });
  }
}
