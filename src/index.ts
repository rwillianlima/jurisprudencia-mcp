import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const API_TJGO =
  "https://jurisprudencia-api.renatowill.workers.dev";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxE2EufYylpYQ7eo2iXtX16nnV8BWvIq6c-OqIRu15ASnWV0gv4X15v7Y9_L-sm_rbL/exec";

interface Env {
  GOOGLE_SCRIPT_SECRET: string;
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "Jurisprudencia TJGO",
    version: "1.1.0",
  });

  // ============================================================
  // FERRAMENTA 1 — JURISPRUDÊNCIA COMPLETA TJGO / TURSO
  // ============================================================

  server.registerTool(
    "pesquisar_jurisprudencia_tjgo",
    {
      description:
        "Pesquisa acórdãos e ementas na base completa de jurisprudência do TJGO. Use para localizar precedentes por tese jurídica, relator, Câmara, processo ou período.",

      inputSchema: {
        q: z
          .string()
          .optional()
          .describe(
            'Consulta FTS5. Aceita AND, OR, NOT, aspas e parênteses.'
          ),

        relator: z
          .string()
          .optional()
          .describe("Nome ou parte do nome do relator."),

        camara: z
          .string()
          .optional()
          .describe("Câmara ou órgão julgador."),

        processo: z
          .string()
          .optional()
          .describe("Número do processo no padrão CNJ."),

        data_de: z
          .string()
          .optional()
          .describe("Data inicial no formato AAAA-MM-DD."),

        data_ate: z
          .string()
          .optional()
          .describe("Data final no formato AAAA-MM-DD."),

        ordem: z
          .enum([
            "relevancia",
            "data_desc",
            "data_asc",
            "processo",
          ])
          .optional(),

        limite: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional(),

        pagina: z
          .number()
          .int()
          .min(1)
          .optional(),
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
            content: [{
              type: "text",
              text:
                `Erro ao consultar a jurisprudência TJGO. ` +
                `HTTP ${resposta.status}: ${texto}`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: texto,
          }],
        };

      } catch (erro) {
        return {
          isError: true,
          content: [{
            type: "text",
            text:
              "Falha ao acessar a API de jurisprudência: " +
              String(erro),
          }],
        };
      }
    }
  );

  // ============================================================
  // FERRAMENTA 2 — GOOGLE APPS SCRIPT
  // Súmulas, Temas e posicionamentoInterno
  // ============================================================

  server.registerTool(
    "consultar_base_juridica",
    {
      description:
        "Consulta a base jurídica interna do Gabinete. Use para pesquisar Súmulas TJGO/STJ/STF, Temas STJ, Temas TJGO/IRDR e posicionamentoInterno do Des. Fernando Ribeiro Montefusco.",

      inputSchema: {
        fontes: z
          .array(
            z.enum([
              "SUMULAS_TJGO",
              "SUMULAS_STJ",
              "SUMULAS_STF",
              "TEMAS_STJ",
              "TEMAS_TJGO",
            ])
          )
          .optional()
          .describe(
            "Fontes que devem ser consultadas."
          ),

        consultaBooleana: z
          .string()
          .optional()
          .describe(
            'Consulta textual. Aceita e, ou, não, aspas e parênteses.'
          ),

        termosObrigatorios: z
          .array(z.string())
          .optional()
          .describe(
            "Termos que obrigatoriamente devem constar no resultado."
          ),

        expressoesExatas: z
          .array(z.string())
          .optional()
          .describe(
            "Expressões exatas a pesquisar."
          ),

        termosOpcionais: z
          .array(z.string())
          .optional()
          .describe(
            "Termos opcionais usados para aumentar a relevância."
          ),

        numero: z
          .string()
          .optional()
          .describe(
            "Número exato de Súmula ou Tema, quando aplicável."
          ),

        relator: z
          .string()
          .optional()
          .describe(
            "Filtro por relator, quando necessário."
          ),

        dataInicio: z
          .string()
          .optional()
          .describe(
            "Data inicial para filtros temporais."
          ),

        dataFim: z
          .string()
          .optional()
          .describe(
            "Data final para filtros temporais."
          ),

        area: z
          .string()
          .optional()
          .describe(
            "Área jurídica para filtrar posicionamento interno."
          ),

        status: z
          .string()
          .optional()
          .describe(
            'Status do posicionamento interno. Normalmente "VIGENTE".'
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
      },
    },

    async ({
      fontes,
      consultaBooleana,
      termosObrigatorios,
      expressoesExatas,
      termosOpcionais,
      numero,
      relator,
      dataInicio,
      dataFim,
      area,
      status,
      limite,
    }) => {

      const parametros: Record<string, unknown> = {};

      if (fontes?.length)
        parametros.fontes = fontes;

      if (consultaBooleana)
        parametros.consultaBooleana = consultaBooleana;

      if (termosObrigatorios?.length)
        parametros.termosObrigatorios = termosObrigatorios;

      if (expressoesExatas?.length)
        parametros.expressoesExatas = expressoesExatas;

      if (termosOpcionais?.length)
        parametros.termosOpcionais = termosOpcionais;

      if (numero)
        parametros.numero = numero;

      if (relator)
        parametros.relator = relator;

      if (dataInicio)
        parametros.dataInicio = dataInicio;

      if (dataFim)
        parametros.dataFim = dataFim;

      if (area)
        parametros.area = area;

      if (status)
        parametros.status = status;

      parametros.limite = limite || 20;

      const corpo = {
        segredo: env.GOOGLE_SCRIPT_SECRET,
        acao: "pesquisarJurisprudencia",
        parametros,
      };

      try {
        const resposta = await fetch(
          GOOGLE_SCRIPT_URL,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "text/plain;charset=utf-8",
            },
            body: JSON.stringify(corpo),
          }
        );

        const texto = await resposta.text();

        if (!resposta.ok) {
          return {
            isError: true,
            content: [{
              type: "text",
              text:
                `Erro ao consultar a base jurídica. ` +
                `HTTP ${resposta.status}: ${texto}`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: texto,
          }],
        };

      } catch (erro) {
        return {
          isError: true,
          content: [{
            type: "text",
            text:
              "Falha ao acessar a base jurídica: " +
              String(erro),
          }],
        };
      }
    }
  );

  return server;
}

export default {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ) {
    return createMcpHandler(
      () => createServer(env)
    )(
      request,
      env,
      ctx
    );
  },
};
