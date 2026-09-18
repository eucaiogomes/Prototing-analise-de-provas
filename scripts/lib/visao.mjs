import { readFile } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';

const MODELO = process.env.GEMINI_MODELO || 'gemini-3.1-flash-lite-preview';

/* O produto separa o que foi observado do que aquilo pode significar.
   A instrução ao modelo carrega a mesma regra: ele descreve, não conclui. */
const INSTRUCAO = `Você analisa quadros de uma gravação de avaliação (prova) para uma
ferramenta de apoio à revisão humana.

Cada quadro contém a gravação da tela do candidato e, em algum canto, um recorte
da câmera dele. O recorte da câmera pode estar em qualquer canto — localize-o.

Para cada quadro, descreva SOMENTE o que está visível.

Regras que não podem ser quebradas:
- Nunca afirme que houve cola, fraude ou irregularidade. Isso é decisão de quem revisa.
- Nunca deduza intenção. "Página do ChatGPT em primeiro plano" é aceitável;
  "candidato buscou a resposta" não é.
- Se não conseguir ler algo, diga que não conseguiu, em vez de supor.
- Para cada quadro você recebe duas imagens: o quadro inteiro e, logo depois,
  um recorte em resolução nativa da faixa superior da tela. Use o recorte para
  ler a barra de endereço e os títulos das abas, e transcreva a URL exatamente
  como aparece. Se estiver ilegível, devolva string vazia.
- Em "tela_app" nomeie o site ou serviço em primeiro plano — "ChatGPT",
  "Google", "DeepSeek", "Gemini", "Lector". Nunca o navegador: "Google Chrome"
  e "Microsoft Edge" não são respostas aceitáveis, o navegador é só a janela.
  Nunca repita a categoria ali: "busca", "prova" e "ia" não são nomes de
  serviço. Se não conseguir identificar o serviço, devolva string vazia.
- Uma página de busca em branco ou uma nova guia com campo de pesquisa é "busca".
- Botões da moldura do navegador NÃO são prova de que a ferramenta foi usada.
  "Peça ao Gemini", "Modo IA", "Perguntar ao Copilot" e ícones de extensão
  aparecem em todas as páginas daquele navegador, inclusive numa guia em branco.
  Só conta o conteúdo da página e a barra de endereço. Se a página estiver vazia
  ou ilegível, a categoria é "outro" e tela_app fica vazio — mencione na
  descrição que havia o botão, sem tratá-lo como uso.

Categorias de tela:
- "prova": a própria plataforma de avaliação
- "ia": ferramenta de IA conversacional (ChatGPT, Gemini, DeepSeek, Copilot, Claude…)
- "busca": mecanismo de busca
- "consulta": wiki, documentação, fórum, material de referência online
- "documento": arquivo local ou PDF aberto
- "sistema": configurações, gravador de tela, área de trabalho
- "outro": qualquer outra coisa`;

const esquema = {
  type: 'object',
  properties: {
    quadros: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          instante: { type: 'number', description: 'o instante informado para este quadro, em segundos' },
          tela_app: { type: 'string', description: 'nome do site ou aplicativo em primeiro plano' },
          tela_url: { type: 'string', description: 'URL lida na barra de endereço, ou vazio' },
          tela_categoria: {
            type: 'string',
            enum: ['prova', 'ia', 'busca', 'consulta', 'documento', 'sistema', 'outro'],
          },
          tela_descricao: { type: 'string', description: 'uma frase factual sobre o que a tela mostra' },
          abas_visiveis: {
            type: 'array', items: { type: 'string' },
            description: 'títulos das abas legíveis na barra do navegador',
          },
          camera_visivel: { type: 'boolean' },
          camera_pessoas: { type: 'integer', description: 'quantas pessoas aparecem no recorte da câmera' },
          camera_olhando_para_tela: { type: 'boolean' },
          camera_dispositivo_visivel: { type: 'boolean', description: 'celular, tablet ou outro aparelho à vista' },
          camera_observacao: { type: 'string' },
          confianca: { type: 'number', description: 'de 0 a 1' },
        },
        required: [
          'instante', 'tela_app', 'tela_url', 'tela_categoria', 'tela_descricao',
          'camera_visivel', 'camera_pessoas', 'camera_olhando_para_tela',
          'camera_dispositivo_visivel', 'camera_observacao', 'confianca',
        ],
      },
    },
  },
  required: ['quadros'],
};

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* A API devolve 503 sob demanda alta e 429 quando a cota estoura. Num lote de
   centenas de quadros isso é rotina, não exceção — sem retentativa o pipeline
   morre no meio e perde o que já custou. */
async function comRetentativa(fn, { tentativas = 5, base = 2000 } = {}) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      const msg = String(e?.message ?? e);
      const recuperavel = /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|timeout)\b/i.test(msg);
      if (!recuperavel || i === tentativas - 1) throw e;
      await espera(base * 2 ** i + Math.random() * 1000);
    }
  }
  throw ultimo;
}

/**
 * Monta o trecho da instrução que descreve as regras da avaliação.
 *
 * Sem isso o modelo não tem como saber que a wiki da própria instituição é
 * consulta autorizada e o ChatGPT não é — e o relatório fica em cima do muro,
 * repetindo "a regra da certificação define" em todo evento. A regra é
 * informada por certificação, não cravada no código.
 */
function trechoDeRegras(regras) {
  if (!regras) return '';
  const linhas = ['', 'Regras desta avaliação, informadas pela instituição:'];
  for (const [cat, texto] of Object.entries(regras.permitido ?? {}))
    linhas.push(`- "${cat}" é PERMITIDO. ${texto}`);
  for (const [cat, texto] of Object.entries(regras.proibido ?? {}))
    linhas.push(`- "${cat}" é PROIBIDO. ${texto}`);
  for (const [cat, texto] of Object.entries(regras.neutro ?? {}))
    linhas.push(`- "${cat}" não é avaliado. ${texto}`);
  if (regras.observacoes) linhas.push(`- Contexto: ${regras.observacoes}`);
  linhas.push('');
  linhas.push('As regras mudam o QUE É RELEVANTE registrar, não o que você afirma.');
  linhas.push('Continue descrevendo apenas o visível: nunca escreva que o candidato');
  linhas.push('violou uma regra. Quem decide isso é quem revisa.');
  return linhas.join('\n');
}

export async function classificarLote(quadros, { apiKey, modelo = MODELO, regras = null } = {}) {
  const ai = new GoogleGenAI({ apiKey });

  const parts = [];
  for (const q of quadros) {
    parts.push({ text: `Quadro no instante ${q.t} segundos — visão geral:` });
    parts.push({
      inlineData: { mimeType: 'image/jpeg', data: (await readFile(q.arquivo)).toString('base64') },
    });
    if (q.topo) {
      parts.push({ text: `Mesmo instante (${q.t}s) — faixa superior em resolução nativa:` });
      parts.push({
        inlineData: { mimeType: 'image/jpeg', data: (await readFile(q.topo)).toString('base64') },
      });
    }
  }
  parts.push({
    text: `Devolva um objeto com "quadros": um item por quadro, na mesma ordem, repetindo o instante informado.`,
  });

  const resposta = await comRetentativa(() =>
    ai.models.generateContent({
      model: modelo,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: INSTRUCAO + trechoDeRegras(regras),
        responseMimeType: 'application/json',
        responseSchema: esquema,
        temperature: 0,
      },
    })
  );

  const bruto = resposta.text;
  try {
    return JSON.parse(bruto).quadros ?? [];
  } catch {
    throw new Error(`Resposta não é JSON válido: ${String(bruto).slice(0, 300)}`);
  }
}
