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


// ============================================================
// AUXILIAR — CONSULTA GOOGLE APPS SCRIPT
// ============================================================

async function consultarGoogleScript(
  env: Env,
  parametros: Record<string, unknown>
) {
  if (!env.GOOGLE_SCRIPT_SECRET) {
    throw new Error(
      "GOOGLE_SCRIPT_SECRET não está configurado no Cloudflare."
    );
  }

  const corpo = {
    segredo: env.GOOGLE_SCRIPT_SECRET,
    acao: "pesquisarJurisprudencia",
    parametros,
  };

  const resposta = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(corpo),
  });

  const texto = await resposta.text();

  if (!resposta.ok) {
    throw new Error(
      `Google Apps Script respondeu HTTP ${resposta.status}: ${texto}`
    );
  }

  return texto;
}


// ============================================================
// AUXILIAR — TRANSFORMA QUERY STRING EM PARÂMETROS DO SCRIPT
// ============================================================

function obterParametrosBaseJuridica(url: URL) {
  const parametros: Record<string, unknown> = {};

  const fontes = [
    ...url.searchParams.getAll("fonte"),
    ...url.searchParams.getAll("fontes"),
  ]
    .flatMap((valor) => valor.split(","))
    .map((valor) => valor.trim())
    .filter(Boolean);

  if (fontes.length) {
    parametros.fontes = [...new Set(fontes)];
  }

  const q =
    url.searchParams.get("q") ||
    url.searchParams.get("consultaBooleana");

  if (q) {
    parametros.consultaBooleana = q;
  }

  const termosObrigatorios = [
    ...url.searchParams.getAll("termo_obrigatorio"),
    ...url.searchParams.getAll("termosObrigatorios"),
  ]
    .flatMap((valor) => valor.split(","))
    .map((valor) => valor.trim())
    .filter(Boolean);

  if (termosObrigatorios.length) {
    parametros.termosObrigatorios = termosObrigatorios;
  }

  const expressoesExatas = [
    ...url.searchParams.getAll("expressao_exata"),
    ...url.searchParams.getAll("expressoesExatas"),
  ]
    .flatMap((valor) => valor.split(","))
    .map((valor) => valor.trim())
    .filter(Boolean);

  if (expressoesExatas.length) {
    parametros.expressoesExatas = expressoesExatas;
  }

  const termosOpcionais = [
    ...url.searchParams.getAll("termo_opcional"),
    ...url.searchParams.getAll("termosOpcionais"),
  ]
    .flatMap((valor) => valor.split(","))
    .map((valor) => valor.trim())
    .filter(Boolean);

  if (termosOpcionais.length) {
    parametros.termosOpcionais = termosOpcionais;
  }

  const numero = url.searchParams.get("numero");
  if (numero) parametros.numero = numero;

  const relator = url.searchParams.get("relator");
  if (relator) parametros.relator = relator;

  const dataInicio =
    url.searchParams.get("data_inicio") ||
    url.searchParams.get("dataInicio");

  if (dataInicio) parametros.dataInicio = dataInicio;

  const dataFim =
    url.searchParams.get("data_fim") ||
    url.searchParams.get("dataFim");

  if (dataFim) parametros.dataFim = dataFim;

  const area = url.searchParams.get("area");
  if (area) parametros.area = area;

  const status = url.searchParams.get("status");
  if (status) parametros.status = status;

  const limite = Number(url.searchParams.get("limite") || "20");

  parametros.limite =
    Number.isFinite(limite) && limite >= 1
      ? Math.min(limite, 100)
      : 20;

  return parametros;
}


// ============================================================
// MCP
// ============================================================

function createServer(env: Env) {
  const server = new McpServer({
    name: "Jurisprudencia TJGO",
    version: "1.2.0",
  });


  // ----------------------------------------------------------
  // FERRAMENTA 1 — TURSO / TJGO
  // ----------------------------------------------------------

  server.registerTool(
    "pesquisar_jurisprudencia_tjgo",
    {
      description:
        "Pesquisa acórdãos e ementas na base completa de jurisprudência do Tribunal de Justiça do Estado de Goiás (TJGO).",

      inputSchema: {
        q: z
          .string()
          .optional()
          .describe(
            "Consulta textual. Aceita AND, OR, NOT, aspas e parênteses."
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
          .describe("Número do processo."),

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
      try {
        const params = new URLSearchParams();

        if (q) params.set("q", q);

        if (relator) {
          params.append("relator", relator);
        }

        if (camara) {
          params.append("camara", camara);
        }

        if (processo) {
          params.set("processo", processo);
        }

        if (data_de) {
          params.set("data_de", data_de);
        }

        if (data_ate) {
          params.set("data_ate", data_ate);
        }

        params.set(
          "ordem",
          ordem || "relevancia"
        );

        params.set(
          "limite",
          String(limite || 20)
        );

        params.set(
          "pagina",
          String(pagina || 1)
        );

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
                  `Erro na jurisprudência TJGO. ` +
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
                "Falha ao consultar jurisprudência TJGO: " +
                String(erro),
            },
          ],
        };
      }
    }
  );


  // ----------------------------------------------------------
  // FERRAMENTA 2 — GOOGLE APPS SCRIPT
  // ----------------------------------------------------------

  server.registerTool(
    "consultar_base_juridica",
    {
      description:
        "Consulta a base jurídica interna com Súmulas TJGO, STJ e STF, Temas STJ, Temas TJGO e posicionamento interno.",

      inputSchema: {
        fontes: z
          .array(z.string())
          .optional()
          .describe(
            "Bases a pesquisar, como SUMULAS_TJGO, SUMULAS_STJ, SUMULAS_STF, TEMAS_STJ e TEMAS_TJGO."
          ),

        consultaBooleana: z
          .string()
          .optional()
          .describe("Consulta textual ou booleana."),

        termosObrigatorios: z
          .array(z.string())
          .optional(),

        expressoesExatas: z
          .array(z.string())
          .optional(),

        termosOpcionais: z
          .array(z.string())
          .optional(),

        numero: z
          .string()
          .optional(),

        relator: z
          .string()
          .optional(),

        dataInicio: z
          .string()
          .optional(),

        dataFim: z
          .string()
          .optional(),

        area: z
          .string()
          .optional(),

        status: z
          .string()
          .optional(),

        limite: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional(),
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
      try {
        const parametros: Record<string, unknown> = {};

        if (fontes?.length) {
          parametros.fontes = fontes;
        }

        if (consultaBooleana) {
          parametros.consultaBooleana =
            consultaBooleana;
        }

        if (termosObrigatorios?.length) {
          parametros.termosObrigatorios =
            termosObrigatorios;
        }

        if (expressoesExatas?.length) {
          parametros.expressoesExatas =
            expressoesExatas;
        }

        if (termosOpcionais?.length) {
          parametros.termosOpcionais =
            termosOpcionais;
        }

        if (numero) {
          parametros.numero = numero;
        }

        if (relator) {
          parametros.relator = relator;
        }

        if (dataInicio) {
          parametros.dataInicio = dataInicio;
        }

        if (dataFim) {
          parametros.dataFim = dataFim;
        }

        if (area) {
          parametros.area = area;
        }

        if (status) {
          parametros.status = status;
        }

        parametros.limite = limite || 20;

        const texto =
          await consultarGoogleScript(
            env,
            parametros
          );

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
                "Falha ao consultar a base jurídica: " +
                String(erro),
            },
          ],
        };
      }
    }
  );

  return server;
}


// ============================================================
// WORKER
// ============================================================

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {

    const url = new URL(request.url);


    // --------------------------------------------------------
    // REST — GOOGLE APPS SCRIPT
    // --------------------------------------------------------

    if (
      url.pathname === "/api/base-juridica" &&
      request.method === "GET"
    ) {
      try {
        const parametros =
          obterParametrosBaseJuridica(url);

        const texto =
          await consultarGoogleScript(
            env,
            parametros
          );

        return new Response(texto, {
          status: 200,
          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      } catch (erro) {
        return Response.json(
          {
            erro:
              "Falha ao consultar a base jurídica.",
            detalhe: String(erro),
          },
          {
            status: 500,
          }
        );
      }
    }


    // --------------------------------------------------------
    // REST — TURSO
    // --------------------------------------------------------

    if (
      url.pathname === "/api/jurisprudencia" &&
      request.method === "GET"
    ) {
      try {
        const destino =
          `${API_TJGO}/buscar${url.search}`;

        const resposta =
          await fetch(destino);

        const corpo =
          await resposta.text();

        return new Response(corpo, {
          status: resposta.status,
          headers: {
            "Content-Type":
              resposta.headers.get("Content-Type") ||
              "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      } catch (erro) {
        return Response.json(
          {
            erro:
              "Falha ao consultar a jurisprudência TJGO.",
            detalhe: String(erro),
          },
          {
            status: 500,
          }
        );
      }
    }


    // --------------------------------------------------------
    // HEALTH
    // --------------------------------------------------------

    if (
      url.pathname === "/health" &&
      request.method === "GET"
    ) {
      return Response.json({
        status: "ok",
        servico: "jurisprudencia-mcp",
        ferramentas: [
          "pesquisar_jurisprudencia_tjgo",
          "consultar_base_juridica",
        ],
        endpoints: [
          "/mcp",
          "/api/jurisprudencia",
          "/api/base-juridica",
        ],
      });
    }


    // --------------------------------------------------------
    // MCP
    // --------------------------------------------------------

    const mcp = createMcpHandler(
      () => createServer(env),
      {
        route: "/mcp",
      }
    );

    return mcp(
      request,
      env,
      ctx
    );
  },
} satisfies ExportedHandler<Env>;
