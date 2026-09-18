import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

/**
 * Entrega ao navegador um token para subir o MP4 direto ao Blob.
 *
 * O arquivo não passa por aqui: função da Vercel aceita 4,5 MB de corpo e uma
 * gravação de 3h tem centenas de megabytes. O token é a única coisa que
 * trafega por esta rota.
 */
export default async function handler(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

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
