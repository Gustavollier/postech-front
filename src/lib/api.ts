import type { Registro } from './types';

/**
 * Cliente HTTP do painel — Fase 4.
 *
 * A diferença em relação à Fase 3 não é de estilo, é de topologia: não existe
 * mais uma API só. São quatro microsserviços atrás do Azure API Management, e
 * o primeiro segmento do caminho é o nome do serviço (ver `apim.tf`, a API de
 * cada serviço usa `path = each.key`). Daí os prefixos abaixo em vez de um
 * `/api/v1` único.
 *
 * O APIM é a única porta pública: valida o JWT, aplica rate limit por IP e
 * encaminha para o AKS, ou para a Auth Function em Container Apps no caso de
 * `/auth`. O painel nunca fala com o cluster direto.
 *
 * `subscription_required = false` nas APIs, e o CORS libera qualquer origem com
 * qualquer header — então o navegador chama o APIM sem chave de subscrição.
 */
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? 'https://pos-tech-fiap-apim.azure-api.net';

/** Prefixo de cada serviço no APIM. */
const OS = '/os/api/v1';
const BILLING = '/billing/api/v1';
const EXECUCAO = '/execucao/api/v1';
const IDENTIDADE = '/identidade/api/v1';

// ---------------------------------------------------------------------------
// Corpos de escrita, espelhando os records dos controllers.
//
// Os enums vão como TEXTO: os três serviços registram JsonStringEnumConverter,
// então é "MaoDeObra" e não 0. Mandar número aqui dá 400.
// ---------------------------------------------------------------------------

export type TipoItem = 'MaoDeObra' | 'Peca';

export type CargoFuncionario =
  | 'Mecanico'
  | 'Recepcionista'
  | 'Gerente'
  | 'Estoquista'
  | 'Eletricista'
  | 'Lavador'
  | 'Supervisor';

/** Identidade: `NovoCliente`. CPF ou CNPJ, nunca os dois — o banco tem CHECK. */
export type NovoCliente = {
  cpf?: string | null;
  cnpj?: string | null;
  nomeCompleto: string;
  telefone?: string | null;
  email?: string | null;
};

/** Identidade: `AtualizarClienteRequest` — documento não se altera. */
export type EdicaoCliente = {
  nomeCompleto?: string | null;
  telefone?: string | null;
  email?: string | null;
};

/** Identidade: `NovoVeiculo`. */
export type NovoVeiculo = {
  clienteId: number;
  marca?: string | null;
  modelo?: string | null;
  placa?: string | null;
  cor?: string | null;
  anoModelo?: number | null;
  anoFabricacao?: number | null;
  kmEntrada?: number | null;
};

/** Identidade: `DadosDoVeiculo` — placa não se altera, é identidade do veículo. */
export type EdicaoVeiculo = {
  marca?: string | null;
  modelo?: string | null;
  cor?: string | null;
  anoModelo?: number | null;
  anoFabricacao?: number | null;
  kmEntrada?: number | null;
};

/** Identidade: `NovoFuncionario`. */
export type NovoFuncionario = {
  nome: string;
  contato: string;
  cpf: string;
  cargo: CargoFuncionario;
  valorHora: number;
  senha: string;
};

/** Identidade: `DadosDoFuncionario` — CPF identifica, não entra no corpo. */
export type EdicaoFuncionario = {
  nome: string;
  contato: string;
  cargo: CargoFuncionario;
  valorHora: number;
};

/**
 * OS: `AbrirOrdemRequest`.
 *
 * Carrega nome, descrição do veículo e e-mail porque o OS Service não consulta
 * o Identidade a cada leitura: o que ele precisa mostrar vem na abertura e fica
 * no agregado dele. É a escolha de "Identidade é consultado, não coordenado"
 * do ADR-0006.
 */
export type NovaOrdem = {
  idCliente: number;
  idVeiculo: number;
  idFuncionario: number;
  nomeCliente: string;
  descricaoVeiculo: string;
  emailCliente: string;
};

/** Execução: `ItemDoDiagnosticoRequest`. */
export type ItemDoDiagnostico = {
  descricao: string;
  tipo: TipoItem;
  /** Só para `tipo: 'Peca'` — é o id do documento no Mongo, texto. */
  idPeca?: string | null;
  quantidade: number;
  valorUnitario: number;
};

/** Execução: `CadastrarPecaRequest`. */
export type NovaPeca = {
  nome: string;
  marca?: string | null;
  codigo?: string | null;
  preco: number;
  quantidadeEmEstoque: number;
};

/** Passos da saga, na ordem — espelha `EPassoDaSaga` do orquestrador. */
export const PASSOS_DA_SAGA = [
  'AguardandoDiagnostico',
  'AguardandoOrcamento',
  'AguardandoAprovacao',
  'AguardandoPagamento',
  'AguardandoExecucao',
  'Concluida',
  'Compensando',
  'Cancelada',
] as const;

export type PassoDaSaga = (typeof PASSOS_DA_SAGA)[number];

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

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

/**
 * Correlação fixada pela tela de demonstração.
 *
 * Normalmente cada chamada ganha um id novo. No vídeo isso atrapalha: são seis
 * ou sete chamadas para uma ordem só, e o Datadog mostraria sete rastros
 * soltos. Fixando um id, o fluxo inteiro aparece como um rastro — que é
 * exatamente o que o requisito de rastreamento distribuído pede para mostrar.
 */
let correlacaoFixa: string | null = null;
export function fixarCorrelacao(id: string | null) {
  correlacaoFixa = id;
}
export function correlacaoAtual() {
  return correlacaoFixa;
}

async function requisicao<T>(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  opcoes: { semAuth?: boolean } = {},
): Promise<T> {
  const correlationId = correlacaoFixa ?? novoCorrelationId();
  const inicio = performance.now();

  const headers: Record<string, string> = {
    Accept: 'application/json',
    // Propagado ponta a ponta: o APIM reaproveita este ID, cada serviço o
    // coloca no escopo do logger, e ele atravessa a fila dentro do envelope do
    // evento. É o que liga os quatro serviços num rastro só no Datadog.
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
    const m = d.erro ?? d.message ?? d.mensagem ?? d.title;
    if (typeof m === 'string' && m) return m;
  }
  if (status === 401) return 'Sessão expirada ou token inválido. Entre novamente.';
  if (status === 403) return 'Sem permissão para esta operação.';
  if (status === 404) return 'Recurso não encontrado.';
  if (status === 409) return 'A operação conflita com o estado atual do recurso.';
  if (status === 429) return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes.';
  // 502/503/504 têm causa própria na Fase 4: o Billing distingue adquirente
  // fora do ar, sem configuração e timeout. A mensagem do corpo é melhor que
  // qualquer texto genérico, e já foi tentada acima.
  if (status === 503) return 'Serviço indisponível. Verifique a configuração do adquirente.';
  if (status === 504) return 'O adquirente não respondeu dentro do prazo. Tente novamente.';
  if (status >= 500) return 'O servidor encontrou um erro. Tente novamente em instantes.';
  return `A requisição falhou (HTTP ${status}).`;
}

/** Garante uma lista mesmo quando a API devolve um envelope. */
export function comoLista(v: unknown): Registro[] {
  if (Array.isArray(v)) return v as Registro[];
  if (v && typeof v === 'object') {
    for (const chave of ['itens', 'items', 'data', 'result', 'value', 'ordens', 'clientes', 'pecas']) {
      const interno = (v as Registro)[chave];
      if (Array.isArray(interno)) return interno as Registro[];
    }
  }
  return [];
}

const doc = (s: string) => s.replace(/\D/g, '');

/**
 * Repete a chamada enquanto ela responder 404, por alguns segundos.
 *
 * Só para o que depende de um evento ainda em trânsito na fila. Qualquer outro
 * erro sobe na hora; e se o 404 persistir, sobe também — aí o recurso não
 * existe mesmo.
 */
async function comEspera<T>(chamar: () => Promise<T>, tentativas = 8, intervaloMs = 1000): Promise<T> {
  for (let i = 1; ; i += 1) {
    try {
      return await chamar();
    } catch (e) {
      if (!(e instanceof ErroApi) || e.status !== 404 || i >= tentativas) throw e;
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
}

export const api = {
  // --- Autenticação -------------------------------------------------------

  /** Cliente por CPF — Auth Function serverless, via APIM em `/auth`. */
  async autenticarCliente(cpf: string) {
    return requisicao<Registro>('POST', '/auth', { cpf: doc(cpf) }, { semAuth: true });
  },

  /** Funcionário — Identidade Service no AKS. Rota pública na política do APIM. */
  async autenticarFuncionario(cpf: string, senha: string) {
    return requisicao<Registro>(
      'POST',
      `${IDENTIDADE}/autenticacao/login`,
      { cpf: doc(cpf), senha },
      { semAuth: true },
    );
  },

  trocarSenha: (cpf: string, senhaAtual: string, novaSenha: string) =>
    requisicao<unknown>(
      'POST',
      `${IDENTIDADE}/autenticacao/trocar-senha`,
      { cpf: doc(cpf), senhaAtual, novaSenha },
      { semAuth: true },
    ),

  // --- Ordem de serviço: OS Service, o orquestrador da saga ---------------

  /** `idCliente` filtra no servidor — é o escopo que o token de cliente usa. */
  ordens: (idCliente?: number) =>
    requisicao<unknown>(
      'GET',
      `${OS}/ordens-servico${idCliente === undefined ? '' : `?idCliente=${idCliente}`}`,
    ),
  ordem: (id: number) => requisicao<Registro>('GET', `${OS}/ordens-servico/${id}`),
  abrirOrdem: (c: NovaOrdem) => requisicao<Registro>('POST', `${OS}/ordens-servico`, c),
  /** Histórico de status da ordem. */
  statusDaOrdem: (id: number) => requisicao<Registro>('GET', `${OS}/ordens-servico/${id}/status`),
  /**
   * O estado da saga: passo atual, status, ids de orçamento e pagamento, e o
   * motivo da compensação quando houve. É a leitura que a tela de demonstração
   * fica consultando para o vídeo mostrar a saga andando.
   */
  saga: (id: number) => requisicao<Registro>('GET', `${OS}/ordens-servico/${id}/saga`),

  // --- Execução: fila da oficina, diagnóstico e finalização ---------------

  /** `etapa` filtra a fila; sem ela, vem tudo. */
  fila: (etapa?: string) =>
    requisicao<unknown>('GET', `${EXECUCAO}/execucao/fila${etapa ? `?etapa=${encodeURIComponent(etapa)}` : ''}`),
  ordemEmExecucao: (idOrdem: number) =>
    requisicao<Registro>('GET', `${EXECUCAO}/execucao/ordens/${idOrdem}`),
  /** Fecha o diagnóstico com os itens. É o que dispara o orçamento no Billing. */
  registrarDiagnostico: (idOrdem: number, itens: ItemDoDiagnostico[]) =>
    // A ordem chega no Execução pela fila, alguns instantes depois de o OS
    // responder a abertura. Nesse intervalo a saga já diz "aguardando
    // diagnóstico", mas o Execução ainda devolve 404 — e quem clica rápido
    // (a demonstração, justamente) tropeçava nisso. 404 aqui quer dizer "ainda
    // não chegou", então vale esperar um pouco antes de desistir.
    comEspera(() =>
      requisicao<unknown>('POST', `${EXECUCAO}/execucao/ordens/${idOrdem}/diagnostico`, { itens }),
    ),
  finalizarExecucao: (idOrdem: number) =>
    requisicao<unknown>('POST', `${EXECUCAO}/execucao/ordens/${idOrdem}/finalizar`),

  // --- Peças: estoque, no Execução ----------------------------------------

  pecas: () => requisicao<unknown>('GET', `${EXECUCAO}/pecas`),
  /** Id de peça é texto: documento do Mongo, não inteiro como na Fase 3. */
  peca: (id: string) => requisicao<Registro>('GET', `${EXECUCAO}/pecas/${encodeURIComponent(id)}`),
  cadastrarPeca: (p: NovaPeca) => requisicao<unknown>('POST', `${EXECUCAO}/pecas`, p),
  entradaDeEstoque: (id: string, quantidade: number) =>
    requisicao<unknown>('POST', `${EXECUCAO}/pecas/${encodeURIComponent(id)}/entrada`, { quantidade }),

  // --- Orçamento e pagamento: Billing -------------------------------------

  orcamento: (idOrdem: number) => requisicao<Registro>('GET', `${BILLING}/orcamentos/os/${idOrdem}`),
  /**
   * Aprova e cobra, nesta ordem. Pode devolver 502, 503 ou 504 quando o
   * adquirente falha: nesse caso a aprovação já valeu e repetir a chamada
   * retoma só a cobrança.
   */
  aprovarOrcamento: (idOrdem: number) =>
    requisicao<Registro>('POST', `${BILLING}/orcamentos/os/${idOrdem}/aprovar`),
  /** Rejeitar compensa a saga: cancela o orçamento e a ordem. */
  rejeitarOrcamento: (idOrdem: number, motivo: string) =>
    requisicao<unknown>('POST', `${BILLING}/orcamentos/os/${idOrdem}/rejeitar`, { motivo }),

  // --- Clientes e veículos: Identidade ------------------------------------

  /**
   * A listagem é paginada (`{ itens, pagina, tamanho, total }`), 20 por página
   * se nada for pedido. As telas daqui filtram e cruzam em memória, então
   * pedimos a página máxima que o serviço aceita.
   */
  clientes: () => requisicao<unknown>('GET', `${IDENTIDADE}/clientes?tamanho=100`),
  cliente: (id: number) => requisicao<Registro>('GET', `${IDENTIDADE}/clientes/${id}`),
  /** Busca por CPF ou CNPJ, com ou sem pontuação — a API quer só os dígitos. */
  clientePorDocumento: (documento: string) =>
    requisicao<Registro>('GET', `${IDENTIDADE}/clientes/busca?documento=${encodeURIComponent(doc(documento))}`),
  criarCliente: (c: NovoCliente) => requisicao<Registro>('POST', `${IDENTIDADE}/clientes`, c),
  atualizarCliente: (id: number, c: EdicaoCliente) =>
    requisicao<unknown>('PUT', `${IDENTIDADE}/clientes/${id}`, c),
  excluirCliente: (id: number) => requisicao<unknown>('DELETE', `${IDENTIDADE}/clientes/${id}`),
  veiculosDoCliente: (id: number) => requisicao<unknown>('GET', `${IDENTIDADE}/clientes/${id}/veiculos`),

  veiculo: (id: number) => requisicao<Registro>('GET', `${IDENTIDADE}/veiculos/${id}`),
  criarVeiculo: (v: NovoVeiculo) => requisicao<Registro>('POST', `${IDENTIDADE}/veiculos`, v),
  atualizarVeiculo: (id: number, v: EdicaoVeiculo) =>
    requisicao<unknown>('PUT', `${IDENTIDADE}/veiculos/${id}`, v),
  excluirVeiculo: (id: number) => requisicao<unknown>('DELETE', `${IDENTIDADE}/veiculos/${id}`),

  // --- Funcionários: Identidade -------------------------------------------

  funcionarios: () => requisicao<unknown>('GET', `${IDENTIDADE}/funcionarios`),
  funcionario: (id: number) => requisicao<Registro>('GET', `${IDENTIDADE}/funcionarios/${id}`),
  criarFuncionario: (f: NovoFuncionario) => requisicao<Registro>('POST', `${IDENTIDADE}/funcionarios`, f),
  atualizarFuncionario: (id: number, f: EdicaoFuncionario) =>
    requisicao<unknown>('PUT', `${IDENTIDADE}/funcionarios/${id}`, f),
  excluirFuncionario: (id: number) => requisicao<unknown>('DELETE', `${IDENTIDADE}/funcionarios/${id}`),

  // --- Saúde: um por serviço, público, é o que o synthetics observa --------

  saude: (servico: 'os' | 'billing' | 'execucao' | 'identidade') =>
    requisicao<unknown>('GET', `/${servico}/health`, undefined, { semAuth: true }),
};
