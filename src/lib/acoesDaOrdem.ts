import type { Registro } from './types';
import { STATUS, statusDaOrdem, statusDoOrcamento } from './types';

export type Acao = {
  id: 'avancar' | 'calcular' | 'enviar' | 'aprovar' | 'recusar';
  rotulo: string;
  ativa: boolean;
  /** O passo natural agora. No máximo um por vez. */
  principal?: boolean;
  /** Por que está desativada, ou o que a ordem está esperando. */
  motivo?: string;
};

/**
 * Fluxo da ordem, igual ao do domínio.
 *
 * ObterProximoStatus, em OrdemServicoDomainService, só deixa avançar um passo
 * por vez e só para o seguinte. Cancelada e Entregue não avançam.
 */
const PROXIMO: Record<number, number | undefined> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5 };

/** Avançar para estes exige ao menos um item lançado. */
const EXIGE_ITENS = new Set([2, 3, 4]);

/** Calcular e enviar orçamento só valem até Aguardando aprovação. */
const ACEITA_ORCAMENTO = new Set([0, 1, 2]);

const AGUARDANDO_APROVACAO = 2;

/**
 * As ações disponíveis para esta ordem, agora.
 *
 * A tela não decide nada por conta própria: cada regra aqui tem contraparte no
 * backend, e a intenção é nunca oferecer um botão que a API vai recusar. O que
 * não dá para checar daqui — estoque suficiente para finalizar, e-mail do
 * cliente cadastrado — continua aparecendo e falhando com a mensagem da API,
 * porque adivinhar seria pior do que deixar a API responder.
 *
 * É valor derivado, não efeito: tudo que entra aqui já está em mãos quando a
 * tela renderiza. Um useEffect só adicionaria um render a mais e uma janela em
 * que os botões mostram o estado anterior.
 */
export function acoesDaOrdem(entrada: {
  ordem: Registro | null;
  orcamento: Registro | null;
  quantidadeDeItens: number;
  ehCliente: boolean;
}): { acoes: Acao[]; resumo: string | null } {
  const { ordem, orcamento, quantidadeDeItens, ehCliente } = entrada;
  if (!ordem) return { acoes: [], resumo: null };

  const status = statusDaOrdem(ordem).id;
  const orc = statusDoOrcamento(orcamento);
  const temItens = quantidadeDeItens > 0;
  const proximo = PROXIMO[status];
  const nomeDe = (id: number) => STATUS.find((s) => s.id === id)?.nome ?? `status ${id}`;

  const orcPendente = orc?.id === 0;
  const orcAprovado = orc?.id === 1;
  const orcRejeitado = orc?.id === 2;
  const aguardandoCliente = status === AGUARDANDO_APROVACAO && orcPendente;

  // ---- perfil cliente: só responde ao orçamento, e só quando a API aceita --
  if (ehCliente) {
    const motivo = !orc
      ? 'A oficina ainda não enviou um orçamento para esta ordem.'
      : orcAprovado
        ? 'Você já aprovou este orçamento.'
        : orcRejeitado
          ? 'Você recusou este orçamento.'
          : status !== AGUARDANDO_APROVACAO
            ? 'Este orçamento ainda não foi enviado para aprovação.'
            : undefined;

    const podeResponder = motivo === undefined;

    return {
      acoes: [
        { id: 'aprovar', rotulo: 'Aprovar orçamento', ativa: podeResponder, principal: podeResponder, motivo },
        { id: 'recusar', rotulo: 'Recusar', ativa: podeResponder, motivo },
      ],
      resumo: podeResponder ? 'A oficina está esperando a sua resposta.' : (motivo ?? null),
    };
  }

  // ---- perfil equipe -------------------------------------------------------
  const acoes: Acao[] = [];

  // Avançar pelo fluxo.
  const exigeItens = proximo !== undefined && EXIGE_ITENS.has(proximo);
  const podeAvancar = proximo !== undefined && (!exigeItens || temItens);
  acoes.push({
    id: 'avancar',
    rotulo: proximo === undefined ? 'Avançar' : `Avançar para ${nomeDe(proximo)}`,
    ativa: podeAvancar,
    motivo:
      proximo === undefined
        ? `A ordem está em ${nomeDe(status)} e não avança mais.`
        : exigeItens && !temItens
          ? 'Lance ao menos um item antes de avançar.'
          : undefined,
  });

  // Calcular orçamento.
  const podeCalcular = ACEITA_ORCAMENTO.has(status) && temItens;
  acoes.push({
    id: 'calcular',
    rotulo: orc ? 'Recalcular' : 'Calcular orçamento',
    ativa: podeCalcular,
    motivo: !temItens
      ? 'Lance ao menos um item para gerar o orçamento.'
      : !ACEITA_ORCAMENTO.has(status)
        ? `O orçamento só é calculado até ${nomeDe(AGUARDANDO_APROVACAO)}.`
        : undefined,
  });

  // Enviar ao cliente.
  const podeEnviar = ACEITA_ORCAMENTO.has(status) && temItens && !aguardandoCliente && !orcAprovado && !orcRejeitado;
  acoes.push({
    id: 'enviar',
    rotulo: 'Enviar ao cliente',
    ativa: podeEnviar,
    motivo: aguardandoCliente
      ? 'Já enviado — aguardando a resposta do cliente.'
      : orcAprovado
        ? 'O cliente já aprovou este orçamento.'
        : orcRejeitado
          ? 'O cliente recusou este orçamento.'
          : !temItens
            ? 'Lance ao menos um item antes de enviar.'
            : !ACEITA_ORCAMENTO.has(status)
              ? `O orçamento só é enviado até ${nomeDe(AGUARDANDO_APROVACAO)}.`
              : undefined,
  });

  // O passo natural: a primeira ação ativa, na ordem em que o fluxo acontece.
  const ordemDeProioridade: Acao['id'][] = temItens
    ? orc
      ? aguardandoCliente
        ? ['avancar']
        : ['enviar', 'avancar', 'calcular']
      : ['calcular', 'avancar']
    : ['avancar'];

  for (const id of ordemDeProioridade) {
    const alvo = acoes.find((a) => a.id === id && a.ativa);
    if (alvo) {
      alvo.principal = true;
      break;
    }
  }

  const resumo = aguardandoCliente
    ? 'Orçamento enviado. A ordem está parada esperando o cliente aprovar ou recusar.'
    : !temItens
      ? 'Sem itens lançados: o orçamento ainda não pode ser gerado.'
      : orcRejeitado
        ? 'O cliente recusou o orçamento e a ordem foi cancelada.'
        : null;

  return { acoes, resumo };
}
