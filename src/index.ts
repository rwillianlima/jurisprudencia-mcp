import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const API_TJGO =
  "https://jurisprudencia-api.renatowill.workers.dev";

function createServer() {
  const server = new McpServer({
    name: "Jurisprudencia TJGO",
    version: "1.0.0",
  });

  server.registerTool(
    "pesquisar_jurisprudencia_tjgo",
    {
      description:
        "Pesquisa acórdãos e ementas na base completa de jurisprudência do Tribunal de Justiça do Estado de Goiás (TJGO). Use para localizar precedentes por tese jurídica, relator, Câmara, processo ou período.",

      inputSchema: {
        q: z
          .string()
          .optional()
          .describe(
            'Consulta textual FTS5. Aceita AND, OR, NOT, aspas e parênteses. Ex.: "gratuidade da justiça" AND hipossuficiencia'
          ),

        relator: z
          .string()
          .optional()
          .describe(
            'Nome ou parte do nome do relator. Ex.: "Montefusco"'
          ),

        camara: z
          .string()
          .optional()
          .describe(
            'Câmara ou órgão julgador. Ex.: "6ª Câmara Cível"'
          ),

        processo: z
          .string()
          .optional()
          .describe(
            "Número do processo no padrão CNJ."
          ),

        data_de: z
          .string()
          .optional()
          .describe(
            "Data inicial do julgamento no formato AAAA-MM-DD."
          ),

        data_ate: z
          .string()
          .optional()
          .describe(
            "Data final do julgamento no formato AAAA-MM-DD."
          ),

        ordem: z
          .enum([
            "relevancia",
            "data_desc",
            "data_asc",
            "processo",
          ])
          .optional()
          .describe(
            "Ordenação dos resultados."
          ),

        limite: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(
            "Quantidade máxima de resultados."
          ),

        pagina: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            "Página dos resultados."
          ),
      },
    },

    async ({
      q,
      relator,
      camara,
      processo,
      data_de,
      data_ate,
      ordem,
      limite,
      pagina,
    }) => {
      const params = new URLSearchParams();

      if (q) params.set("q", q);
      if (relator) params.append("relator", relator);
      if (camara) params.append("camara", camara);
      if (processo) params.set("processo", processo);
      if (data_de) params.set("data_de", data_de);
      if (data_ate) params.set("data_ate", data_ate);

      params.set("ordem", ordem || "relevancia");
      params.set("limite", String(limite || 20));
      params.set("pagina", String(pagina || 1));

      try {
        const resposta = await fetch(
          `${API_TJGO}/buscar?${params.toString()}`
        );

        const texto = await resposta.text();

        if (!resposta.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  `Erro ao consultar a jurisprudência TJGO. ` +
                  `HTTP ${resposta.status}: ${texto}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: texto,
            },
          ],
        };
      } catch (erro) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "Falha ao acessar a API de jurisprudência: " +
                String(erro),
            },
          ],
        };
      }
    }
  );

  return server;
}

export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    return createMcpHandler(createServer)(
      request,
      env,
      ctx
    );
  },
};
