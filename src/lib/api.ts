import type { Registro } from './types';

/**
 * Cliente HTTP do painel.
 *
 * Todas as chamadas passam pelo Azure API Management, que é a única porta de
 * entrada pública: ele valida o JWT, aplica rate limit e encaminha para o AKS
 * ou para a Auth Function. O painel nunca fala direto com o cluster.
 */
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? 'https://pos-tech-fiap-apim.azure-api.net';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly correlationId: string | null,
  ) {
    super(mensagem);
  }
}

/** Registro da última chamada, exibido no inspetor de requisições. */
export type Chamada = {
  metodo: string;
  caminho: string;
  status: number;
  ms: number;
  correlationId: string | null;
  emCache: boolean;
  quando: number;
};

type Ouvinte = (c: Chamada) => void;
const ouvintes = new Set<Ouvinte>();
export function aoChamar(fn: Ouvinte) {
  ouvintes.add(fn);
  // Retorno explicitamente void: este descarte vai direto no cleanup de um
  // useEffect, que nao aceita um valor de retorno.
  return () => {
    ouvintes.delete(fn);
  };
}

function novoCorrelationId() {
  return crypto.randomUUID();
}

let tokenAtual: string | null = null;
export function definirToken(t: string | null) {
  tokenAtual = t;
}

async function requisicao<T>(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  opcoes: { semAuth?: boolean } = {},
): Promise<T> {
  const correlationId = novoCorrelationId();
  const inicio = performance.now();

  const headers: Record<string, string> = {
    Accept: 'application/json',
    // Propagado ponta a ponta: o APIM reaproveita este ID, a aplicação o coloca
    // no escopo do logger e ele aparece no Datadog ligando log e trace.
    'X-Correlation-ID': correlationId,
  };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (!opcoes.semAuth && tokenAtual) headers.Authorization = `Bearer ${tokenAtual}`;

  let resposta: Response;
  try {
    resposta = await fetch(`${API_BASE}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.', correlationId);
  }

  const ms = Math.round(performance.now() - inicio);
  const idDevolvido = resposta.headers.get('X-Correlation-ID') ?? correlationId;

  const evento: Chamada = {
    metodo,
    caminho,
    status: resposta.status,
    ms,
    correlationId: idDevolvido,
    emCache: false,
    quando: Date.now(),
  };
  ouvintes.forEach((o) => o(evento));

  const bruto = await resposta.text();
  const dados = bruto ? seguroJson(bruto) : null;

  if (!resposta.ok) {
    throw new ErroApi(resposta.status, mensagemDeErro(resposta.status, dados), idDevolvido);
  }
  return dados as T;
}

function seguroJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function mensagemDeErro(status: number, dados: unknown): string {
  if (dados && typeof dados === 'object') {
    const d = dados as Registro;
    const m = d.message ?? d.mensagem ?? d.title;
    if (typeof m === 'string' && m) return m;
  }
  if (status === 401) return 'Sessão expirada ou token inválido. Entre novamente.';
  if (status === 403) return 'Sem permissão para esta operação.';
  if (status === 404) return 'Recurso não encontrado.';
  if (status === 429) return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes.';
  if (status >= 500) return 'O servidor encontrou um erro. Tente novamente em instantes.';
  return `A requisição falhou (HTTP ${status}).`;
}

/** Garante uma lista mesmo quando a API devolve um envelope. */
export function comoLista(v: unknown): Registro[] {
  if (Array.isArray(v)) return v as Registro[];
  if (v && typeof v === 'object') {
    for (const chave of ['items', 'data', 'result', 'value', 'ordens', 'clientes', 'pecas']) {
      const interno = (v as Registro)[chave];
      if (Array.isArray(interno)) return interno as Registro[];
    }
  }
  return [];
}

export const api = {
  /** Autenticação do cliente por CPF — Azure Function serverless, via APIM. */
  async autenticarCliente(cpf: string) {
    return requisicao<Registro>('POST', '/auth', { cpf }, { semAuth: true });
  },

  /** Autenticação do funcionário — API principal no AKS, via APIM. */
  async autenticarFuncionario(cpf: string, senha: string) {
    return requisicao<Registro>('POST', '/api/v1/Autenticacao/login', { cpf, senha }, { semAuth: true });
  },

  ordensServico: () => requisicao<unknown>('GET', '/api/v1/ordens-servico'),
  ordensPorStatus: () => requisicao<unknown>('GET', '/api/v1/ordens-servico/ordenado-por-status'),
  ordem: (id: number) => requisicao<Registro>('GET', `/api/v1/ordens-servico/${id}`),
  criarOrdem: (c: { idCliente: number; idVeiculo: number; idFuncionario: number }) =>
    requisicao<Registro>('POST', '/api/v1/ordens-servico', c),
  atualizarStatus: (id: number, idFuncionario: number, status: number) =>
    requisicao<Registro>('PATCH', `/api/v1/ordens-servico/${id}/status`, { idFuncionario, status }),

  clientes: () => requisicao<unknown>('GET', '/api/v1/clientes'),
  veiculosDoCliente: (id: number) => requisicao<unknown>('GET', `/api/v1/clientes/${id}/veiculos`),
  pecas: () => requisicao<unknown>('GET', '/api/v1/pecas'),
  tempoMedio: () => requisicao<unknown>('GET', '/api/v1/monitoramento/tempo-execucao-medio'),

  /** Health público — não exige token, é o que o synthetics do Datadog observa. */
  saude: () => requisicao<unknown>('GET', '/health', undefined, { semAuth: true }),
};
