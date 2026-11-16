import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, comoLista, ErroApi, type ItemDoDiagnostico } from '../lib/api';
import { useDados } from '../lib/useDados';
import { useAuth } from '../lib/auth';
import { dataCurta, moeda, numero, rotulo, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Vazio } from '../components/Base';
import { Aviso, Campo, Modal, Selecao } from '../components/Form';
import { IconeAtualizar } from '../components/Icones';

/**
 * Uma ordem de serviço na Fase 4.
 *
 * A tela da Fase 3 não sobreviveu à quebra em microsserviços, e não por
 * estilo: ela era montada em torno de coisas que deixaram de existir. Itens da
 * ordem agora nascem do diagnóstico no Execução, e não de um CRUD; o status não
 * se muda por `PATCH`, ele é consequência dos eventos da saga; e orçamento
 * deixou de ser "calcular e enviar" para ser um agregado do Billing, que o
 * cliente aprova ou rejeita.
 *
 * Então o que esta tela faz é diferente: ela **lê** de quatro serviços e expõe
 * as poucas ações que de fato existem, cada uma no passo em que a saga as
 * aceita. O painel da saga é a peça central — é o que explica por que a ordem
 * está onde está.
 */

/** Passos em que uma ação do operador faz sentido. */
const ACAO_DO_PASSO: Record<string, string> = {
  AguardandoDiagnostico: 'diagnostico',
  AguardandoAprovacao: 'orcamento',
  AguardandoExecucao: 'finalizar',
};

const ITENS_SUGERIDOS: ItemDoDiagnostico[] = [
  { descricao: 'Troca de óleo', tipo: 'MaoDeObra', quantidade: 1, valorUnitario: 120.5 },
];

/** O caminho feliz da saga, na ordem, para a trilha de progresso. */
const TRILHA = [
  { passo: 'AguardandoDiagnostico', nome: 'Diagnóstico' },
  { passo: 'AguardandoOrcamento', nome: 'Orçamento' },
  { passo: 'AguardandoAprovacao', nome: 'Aprovação' },
  { passo: 'AguardandoPagamento', nome: 'Pagamento' },
  { passo: 'AguardandoExecucao', nome: 'Execução' },
  { passo: 'Concluida', nome: 'Concluída' },
];

/** O que a ordem está esperando em cada passo, dito para quem opera. */
const ESPERA: Record<string, string> = {
  AguardandoOrcamento: 'O Billing está montando o orçamento a partir do diagnóstico. Leva alguns segundos.',
  AguardandoPagamento: 'Cobrança Pix criada. A ordem segue sozinha quando o Mercado Pago confirmar o pagamento.',
  Compensando: 'A saga está desfazendo os passos anteriores.',
};

export default function OrdemDetalhe() {
  const { id } = useParams<{ id: string }>();
  const idOS = Number(id);
  const { sessao } = useAuth();
  const ehCliente = sessao?.tipo === 'cliente';

  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [modalDiagnostico, setModalDiagnostico] = useState(false);
  const [modalRejeicao, setModalRejeicao] = useState(false);

  const ordem = useDados<Registro | null>(
    async () => (Number.isFinite(idOS) ? await api.ordem(idOS) : null),
    [idOS],
  );

  const historico = useDados<Registro | null>(
    async () => (Number.isFinite(idOS) ? await api.statusDaOrdem(idOS) : null),
    [idOS],
  );

  const orcamento = useDados<Registro | null>(async () => {
    if (!Number.isFinite(idOS)) return null;
    try {
      return await api.orcamento(idOS);
    } catch (e) {
      // 404 é estado normal: o orçamento só existe depois do diagnóstico. Virar
      // erro na tela faria toda ordem recém-aberta parecer quebrada.
      if (e instanceof ErroApi && e.status === 404) return null;
      throw e;
    }
  }, [idOS]);

  const [saga, setSaga] = useState<Registro | null>(null);

  /**
   * O estado da saga, consultado em intervalo enquanto ela estiver viva.
   *
   * `emAndamento` vem do próprio orquestrador — quem decide se a saga acabou é
   * ele, não uma lista de passos mantida aqui, que sairia de sincronia na
   * primeira mudança da máquina de estados.
   */
  const consultarSaga = useCallback(async () => {
    if (!Number.isFinite(idOS)) return;
    try {
      setSaga(await api.saga(idOS));
    } catch {
      // A saga pode não existir nos primeiros instantes da ordem.
    }
  }, [idOS]);

  const viva = saga === null || saga.emAndamento !== false;

  useEffect(() => {
    void consultarSaga();
    if (!viva) return;
    const timer = window.setInterval(consultarSaga, 3000);
    return () => window.clearInterval(timer);
  }, [consultarSaga, viva]);

  // Diagnóstico, aprovação e pagamento andam por evento: a resposta do POST
  // chega antes de o orçamento existir ou de o status mudar. Quem avisa que
  // algo andou é o passo da saga — quando ele muda, relemos o resto, em vez de
  // deixar a tela com orçamento e histórico de um passo atrás até alguém
  // clicar em Atualizar.
  const passoAtual = typeof saga?.passo === 'string' ? saga.passo : null;
  const passoVisto = useRef<string | null>(null);
  useEffect(() => {
    if (passoAtual === null) return;
    if (passoVisto.current !== null && passoVisto.current !== passoAtual) {
      void ordem.recarregar();
      void historico.recarregar();
      void orcamento.recarregar();
    }
    passoVisto.current = passoAtual;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passoAtual]);

  // Só a equipe enxerga o cadastro de funcionários; para o cliente o
  // responsável não é mostrado.
  const idResponsavel = numero(ordem.dados ?? {}, 'idFuncionario');
  const responsavel = useDados<Registro | null>(async () => {
    if (ehCliente || idResponsavel === null) return null;
    try {
      return await api.funcionario(idResponsavel);
    } catch {
      return null;
    }
  }, [ehCliente, idResponsavel]);

  const recarregarTudo = useCallback(() => {
    void ordem.recarregar();
    void historico.recarregar();
    void orcamento.recarregar();
    void consultarSaga();
  }, [ordem, historico, orcamento, consultarSaga]);

  async function executar(oQue: string, acao: () => Promise<void>) {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      setAviso({ tipo: 'ok', texto: oQue });
      recarregarTudo();
    } catch (e) {
      setAviso({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'A operação falhou. Tente de novo.',
      });
    } finally {
      setOcupado(false);
    }
  }

  const passo = typeof saga?.passo === 'string' ? saga.passo : null;
  const acaoDisponivel = passo === null ? null : (ACAO_DO_PASSO[passo] ?? null);

  if (!Number.isFinite(idOS)) {
    return <Vazio titulo="Ordem inválida" descricao="O endereço não traz um número de ordem." />;
  }

  const dados = ordem.dados;
  const cancelada = passo === 'Cancelada';
  const pagamento = typeof orcamento.dados?.statusDoPagamento === 'string' ? orcamento.dados.statusDoPagamento : null;
  const pago = pagamento === 'Confirmado';

  return (
    <>
      <Cabecalho
        titulo={`Ordem #${idOS}`}
        descricao={
          dados
            ? `${texto(dados, 'nomeCliente', 'NomeCliente')} · ${texto(dados, 'descricaoVeiculo', 'DescricaoVeiculo')}`
            : 'Carregando…'
        }
        acao={
          <div className="flex gap-2">
            <Link to="/ordens" className="btn-ghost px-3 py-2 text-xs">
              Voltar
            </Link>
            <button onClick={recarregarTudo} className="btn-ghost px-3 py-2 text-xs" disabled={ordem.carregando}>
              <IconeAtualizar className={`h-4 w-4 ${ordem.carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        }
      />

      {aviso && (
        <div className="mb-5">
          <Aviso tipo={aviso.tipo} texto={aviso.texto} />
        </div>
      )}

      {ordem.erro && <Erro mensagem={ordem.erro} aoTentar={ordem.recarregar} />}
      {ordem.carregando && !dados && !ordem.erro && <Esqueleto linhas={5} />}

      {dados && (
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5">
            {/* --- A saga: por que a ordem está onde está --- */}
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{ehCliente ? 'Andamento' : 'Saga'}</h2>
                {viva && saga !== null && (
                  <span className="flex items-center gap-1.5 text-[11px] text-ink-mute">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                    acompanhando ao vivo
                  </span>
                )}
              </div>

              {saga === null ? (
                <p className="mt-3 text-sm text-ink-mute">
                  Sem estado de saga para esta ordem ainda.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`text-lg font-semibold ${cancelada ? 'text-[#e66767]' : 'text-brand'}`}>
                      {rotulo(saga.passo)}
                    </span>
                    {!ehCliente && (
                      <span className="text-xs text-ink-soft">
                        status da ordem: {rotulo(saga.statusDaOrdem)}
                      </span>
                    )}
                  </div>

                  <Trilha passo={passo} statusDaOrdem={String(saga.statusDaOrdem ?? '')} />

                  {saga.motivoDaCompensacao ? (
                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-amber-300/80">
                        {ehCliente ? 'Motivo do cancelamento' : 'Compensação'}
                      </p>
                      <p className="mt-0.5 text-sm text-amber-100">
                        {texto(saga, 'motivoDaCompensacao', 'MotivoDaCompensacao')}
                      </p>
                    </div>
                  ) : null}

                  {/* Ids de correlação entre serviços: úteis para a equipe e
                      para a demonstração, ruído para o cliente. */}
                  {!ehCliente && (
                    <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <Par rotulo="Orçamento" valor={texto(saga, 'idOrcamento', 'IdOrcamento')} mono />
                      <Par rotulo="Pagamento" valor={texto(saga, 'idPagamento', 'IdPagamento')} mono />
                      <Par rotulo="Referência no adquirente" valor={texto(saga, 'referenciaExterna', 'ReferenciaExterna')} mono />
                      <Par rotulo="Valor" valor={moeda(numero(saga, 'valor', 'Valor'))} />
                    </dl>
                  )}
                </>
              )}
            </section>

            {/* --- Orçamento, do Billing --- */}
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Orçamento</h2>

              {orcamento.dados === null ? (
                <p className="mt-3 text-sm text-ink-mute">
                  {ehCliente
                    ? 'A oficina ainda está avaliando o veículo. O orçamento aparece aqui assim que ficar pronto.'
                    : 'Ainda não existe: ele é montado pelo Billing quando o diagnóstico é registrado.'}
                </p>
              ) : (
                <>
                  <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Par rotulo="Situação" valor={rotulo(orcamento.dados.status)} />
                    <Par rotulo="Pagamento" valor={rotulo(orcamento.dados.statusDoPagamento)} />
                    <Par rotulo="Total" valor={moeda(numero(orcamento.dados, 'valor', 'Valor'))} />
                    {pago && orcamento.dados.pagoEm ? (
                      <Par rotulo="Pago em" valor={dataCurta(texto(orcamento.dados, 'pagoEm'))} />
                    ) : (
                      <Par rotulo="Criado" valor={dataCurta(texto(orcamento.dados, 'criadoEm', 'CriadoEm'))} />
                    )}
                  </dl>

                  {/* O campo se chama `motivoDaRecusa` no Billing; a tela lia um
                      nome que não existe e o motivo nunca aparecia. Ele serve
                      também à rejeição do cliente — essa já está no quadro da
                      saga —, então aqui só entra quando foi o pagamento. */}
                  {orcamento.dados.motivoDaRecusa && pagamento === 'Recusado' ? (
                    <p className="mt-3 text-sm text-[#e66767]">
                      Pagamento recusado: {texto(orcamento.dados, 'motivoDaRecusa')}
                    </p>
                  ) : null}

                  <ItensDoOrcamento orcamento={orcamento.dados} />

                  {/* Só enquanto há o que pagar: com o pagamento confirmado ou a
                      ordem cancelada, o link do Pix é um convite a pagar de novo. */}
                  {typeof orcamento.dados.urlDePagamento === 'string' && orcamento.dados.urlDePagamento && !pago && !cancelada ? (
                    <a
                      href={orcamento.dados.urlDePagamento}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-block rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/25"
                    >
                      Pagar com Pix no Mercado Pago ↗
                    </a>
                  ) : null}

                  {pago && (
                    <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                      ✓ Pagamento confirmado
                    </p>
                  )}
                </>
              )}
            </section>

            {/* --- Histórico de status --- */}
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Histórico de status</h2>
              <Historico consulta={historico} />
            </section>
          </div>

          {/* --- Ações e dados da ordem --- */}
          {/* No celular as ações sobem para o topo: empilhadas depois do
              histórico, o botão do passo atual ficava três telas abaixo. */}
          <aside className="order-first space-y-5 lg:order-none">
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Ações</h2>

              {ehCliente ? (
                <>
                  <p className="mt-3 text-xs text-ink-mute">
                    Como cliente, o que cabe a você é responder ao orçamento.
                  </p>
                  {acaoDisponivel === 'orcamento' ? (
                    <div className="mt-3 space-y-2">
                      <button
                        className="btn-primary w-full py-2 text-xs"
                        disabled={ocupado}
                        onClick={() =>
                          void executar('Orçamento aprovado e cobrança criada.', () =>
                            api.aprovarOrcamento(idOS).then(() => undefined),
                          )
                        }
                      >
                        Aprovar e pagar
                      </button>
                      <button
                        className="btn-ghost w-full py-2 text-xs"
                        disabled={ocupado}
                        onClick={() => setModalRejeicao(true)}
                      >
                        Rejeitar
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-ink-soft">
                      {cancelada
                        ? 'Esta ordem foi cancelada.'
                        : passo === 'Concluida'
                          ? 'Serviço concluído. Obrigado!'
                          : passo === 'AguardandoPagamento'
                            ? 'Orçamento aprovado. Falta só o pagamento do Pix, no botão ao lado do orçamento.'
                            : 'Nada a responder neste momento.'}
                    </p>
                  )}
                </>
              ) : acaoDisponivel === null ? (
                <p className="mt-3 text-sm text-ink-soft">
                  {viva
                    ? (passo !== null && ESPERA[passo]) || 'A saga está esperando um evento, não uma ação sua.'
                    : cancelada
                      ? 'A ordem foi cancelada. Nada a fazer aqui.'
                      : 'A ordem foi concluída. Nada a fazer aqui.'}
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {acaoDisponivel === 'diagnostico' && (
                    <button
                      className="btn-primary w-full py-2 text-xs"
                      disabled={ocupado}
                      onClick={() => setModalDiagnostico(true)}
                    >
                      Registrar diagnóstico
                    </button>
                  )}

                  {acaoDisponivel === 'orcamento' && (
                    <>
                      <button
                        className="btn-primary w-full py-2 text-xs"
                        disabled={ocupado}
                        onClick={() =>
                          void executar('Orçamento aprovado e cobrança criada.', () =>
                            api.aprovarOrcamento(idOS).then(() => undefined),
                          )
                        }
                      >
                        Aprovar pelo cliente
                      </button>
                      <button
                        className="btn-ghost w-full py-2 text-xs"
                        disabled={ocupado}
                        onClick={() => setModalRejeicao(true)}
                      >
                        Rejeitar pelo cliente
                      </button>
                    </>
                  )}

                  {acaoDisponivel === 'finalizar' && (
                    <button
                      className="btn-primary w-full py-2 text-xs"
                      disabled={ocupado}
                      onClick={() =>
                        void executar('Execução finalizada.', () =>
                          api.finalizarExecucao(idOS).then(() => undefined),
                        )
                      }
                    >
                      Finalizar execução
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="card p-5">
              <h2 className="text-sm font-semibold">Dados da ordem</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Par rotulo="Status" valor={cancelada ? 'Cancelada' : rotulo(dados.status)} />
                <Par rotulo="Cliente" valor={texto(dados, 'nomeCliente')} />
                <Par rotulo="Veículo" valor={texto(dados, 'descricaoVeiculo')} />
                {!ehCliente && (
                  <Par
                    rotulo="Responsável"
                    valor={
                      responsavel.dados
                        ? texto(responsavel.dados, 'nome')
                        : `Funcionário ${texto(dados, 'idFuncionario')}`
                    }
                  />
                )}
                <Par rotulo="Aberta" valor={dataCurta(texto(dados, 'criadoEm', 'CriadoEm'))} />
                <Par rotulo="Atualizada" valor={dataCurta(texto(dados, 'atualizadoEm', 'AtualizadoEm'))} />
              </dl>
            </section>
          </aside>
        </div>
      )}

      <ModalDiagnostico
        key={modalDiagnostico ? 'aberto' : 'fechado'}
        aberto={modalDiagnostico}
        aoFechar={() => setModalDiagnostico(false)}
        aoRegistrar={async (itens) => {
          setModalDiagnostico(false);
          await executar('Diagnóstico registrado. O Billing monta o orçamento pela fila.', () =>
            api.registrarDiagnostico(idOS, itens).then(() => undefined),
          );
        }}
      />

      <ModalRejeicao
        aberto={modalRejeicao}
        aoFechar={() => setModalRejeicao(false)}
        aoRejeitar={async (motivo) => {
          setModalRejeicao(false);
          await executar('Orçamento rejeitado. A saga entra em compensação.', () =>
            api.rejeitarOrcamento(idOS, motivo).then(() => undefined),
          );
        }}
      />
    </>
  );
}

function Par({ rotulo, valor, mono = false }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-mute">{rotulo}</dt>
      <dd className={`truncate text-right ${mono ? 'font-mono text-xs' : ''} text-ink-soft`}>{valor}</dd>
    </div>
  );
}

function ItensDoOrcamento({ orcamento }: { orcamento: Registro }) {
  const itens = comoLista(orcamento.itens ?? orcamento.Itens);

  if (itens.length === 0) return null;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-mute">
            <th className="py-2 font-semibold">Item</th>
            <th className="py-2 text-right font-semibold">Qtd</th>
            <th className="py-2 text-right font-semibold">Unitário</th>
            <th className="py-2 text-right font-semibold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i, n) => (
            <tr key={n} className="border-b border-line/50 last:border-0">
              <td className="py-2">
                {texto(i, 'descricao', 'Descricao')}
                <span className="ml-2 text-[11px] text-ink-mute">{rotulo(i.tipo)}</span>
              </td>
              <td className="py-2 text-right tabular-nums">{texto(i, 'quantidade', 'Quantidade')}</td>
              <td className="py-2 text-right tabular-nums">{moeda(numero(i, 'valorUnitario', 'ValorUnitario'))}</td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {moeda(numero(i, 'subtotal', 'Subtotal'))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Historico({
  consulta,
}: {
  consulta: { dados: Registro | null; erro: string | null; carregando: boolean };
}) {
  if (consulta.carregando) return <Esqueleto linhas={3} />;
  if (consulta.erro) return <p className="mt-3 text-sm text-ink-mute">{consulta.erro}</p>;

  const linhas = comoLista(consulta.dados?.historico);

  if (linhas.length === 0) {
    return <p className="mt-3 text-sm text-ink-mute">Nenhuma transição registrada ainda.</p>;
  }

  return (
    <ol className="mt-4 space-y-3">
      {linhas.map((h, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          <div className="min-w-0">
            <p className="text-sm">
              {h.de ? `${rotulo(h.de)} → ` : ''}
              <span className="font-medium">{rotulo(h.para)}</span>
            </p>
            <p className="text-[11px] text-ink-mute">
              {dataCurta(texto(h, 'ocorridoEm', 'OcorridoEm'))}
              {h.motivo ? ` · ${texto(h, 'motivo', 'Motivo')}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * A trilha do caminho feliz, com o passo atual em destaque.
 *
 * Numa saga cancelada não dá para pintar "até onde chegou" pelo passo — ele
 * é `Cancelada`, fora da trilha. O que sobra de confiável é o status em que a
 * ordem ficou, e é por ele que a trilha marca o ponto da interrupção.
 */
function Trilha({ passo, statusDaOrdem }: { passo: string | null; statusDaOrdem: string }) {
  if (passo === null) return null;

  const interrompida = passo === 'Cancelada' || passo === 'Compensando';
  const PARADA_NO_STATUS: Record<string, number> = {
    Recebida: 0,
    EmDiagnostico: 0,
    AguardandoAprovacao: 2,
    EmExecucao: 4,
  };
  const atual = interrompida
    ? (PARADA_NO_STATUS[statusDaOrdem] ?? 0)
    : TRILHA.findIndex((t) => t.passo === passo);
  const concluida = passo === 'Concluida';

  return (
    <ol className="mt-4 flex gap-1" aria-label="Progresso da ordem">
      {TRILHA.map((t, i) => {
        const feito = concluida || i < atual;
        const aqui = !concluida && i === atual;
        const cor = aqui && interrompida ? '#e66767' : feito || aqui ? '#3987e5' : '#232935';
        return (
          <li key={t.passo} className="min-w-0 flex-1" aria-current={aqui ? 'step' : undefined}>
            <div className="h-1.5 rounded-full" style={{ background: cor, opacity: feito ? 0.55 : 1 }} />
            <p
              className={`mt-1.5 truncate text-[11px] ${
                aqui ? 'font-semibold text-ink' : feito ? 'text-ink-soft' : 'text-ink-mute'
              }`}
            >
              {feito ? '✓ ' : ''}
              {t.nome}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * O diagnóstico, que é a entrada dos itens no fluxo.
 *
 * Mão de obra é texto livre. Peça é escolhida do estoque: é o `idPeca` que faz
 * o Execução reservar a unidade para esta ordem e dar baixa na finalização.
 * Antes a tela só mandava mão de obra — uma "peça" digitada entrava no
 * orçamento, mas nunca saía do estoque.
 *
 * Abre com um item plausível porque esta tela serve também à demonstração:
 * digitar quatro campos na frente da câmera só adiciona tempo morto.
 */
function ModalDiagnostico({
  aberto,
  aoFechar,
  aoRegistrar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoRegistrar: (itens: ItemDoDiagnostico[]) => Promise<void>;
}) {
  const [itens, setItens] = useState<ItemDoDiagnostico[]>(ITENS_SUGERIDOS);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const pecas = useDados<Registro[]>(async () => (aberto ? comoLista(await api.pecas()) : []), [aberto]);
  const catalogo = (pecas.dados ?? []).filter((p) => p.ativo !== false);

  function trocar(i: number, novo: Partial<ItemDoDiagnostico>) {
    setItens((atual) => atual.map((item, n) => (n === i ? { ...item, ...novo } : item)));
  }

  const comoNumero = (valor: string) => Number(valor.replace(',', '.')) || 0;

  function escolherPeca(i: number, idPeca: string) {
    const p = catalogo.find((c) => String(c.id) === idPeca);
    trocar(i, {
      idPeca: idPeca || null,
      descricao: p ? texto(p, 'nome') : '',
      valorUnitario: p ? (numero(p, 'preco') ?? 0) : 0,
    });
  }

  const total = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (itens.length === 0) return setErro('Um diagnóstico sem itens não gera orçamento.');
    if (itens.some((i) => i.tipo === 'Peca' && !i.idPeca)) return setErro('Escolha a peça do estoque em cada item de peça.');
    if (itens.some((i) => !i.descricao.trim())) return setErro('Todo item precisa de uma descrição.');
    if (itens.some((i) => i.quantidade <= 0 || !Number.isInteger(i.quantidade)))
      return setErro('A quantidade precisa ser um número inteiro maior que zero.');
    if (itens.some((i) => i.valorUnitario <= 0)) return setErro('O valor unitário precisa ser maior que zero.');

    for (const i of itens) {
      if (i.tipo !== 'Peca') continue;
      const p = catalogo.find((c) => String(c.id) === i.idPeca);
      const disponivel = p ? (numero(p, 'disponivel') ?? 0) : 0;
      if (i.quantidade > disponivel)
        return setErro(`Estoque insuficiente de ${i.descricao}: ${disponivel} disponível(is).`);
    }

    setErro(null);
    setSalvando(true);
    try {
      await aoRegistrar(itens);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Registrar diagnóstico"
      descricao="Os itens viram o orçamento no Billing, por evento. Peças são reservadas no estoque para esta ordem."
      aberto={aberto}
      aoFechar={aoFechar}
    >
      <form onSubmit={enviar} className="space-y-4">
        {itens.map((item, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-line p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Campo rotulo={`Item ${i + 1}`}>
                  <Selecao
                    valor={item.tipo}
                    aoMudar={(v) =>
                      trocar(i, {
                        tipo: v as ItemDoDiagnostico['tipo'],
                        idPeca: null,
                        descricao: '',
                        valorUnitario: 0,
                      })
                    }
                    opcoes={[
                      { valor: 'MaoDeObra', rotulo: 'Mão de obra' },
                      { valor: 'Peca', rotulo: 'Peça do estoque' },
                    ]}
                  />
                </Campo>
              </div>
              <button
                type="button"
                className="btn-ghost px-3 py-3 text-xs"
                aria-label={`Remover item ${i + 1}`}
                onClick={() => setItens((a) => a.filter((_, n) => n !== i))}
              >
                Remover
              </button>
            </div>

            {item.tipo === 'Peca' ? (
              <Campo
                rotulo="Peça"
                dica={
                  !pecas.carregando && catalogo.length === 0
                    ? 'Nenhuma peça cadastrada. Cadastre na tela de Peças.'
                    : undefined
                }
              >
                <Selecao
                  valor={item.idPeca ?? ''}
                  aoMudar={(v) => escolherPeca(i, v)}
                  vazio={pecas.carregando ? 'Carregando peças…' : 'Selecione a peça…'}
                  opcoes={catalogo.map((p) => ({
                    valor: String(p.id),
                    rotulo: `${texto(p, 'nome')} — ${moeda(numero(p, 'preco'))} · ${numero(p, 'disponivel') ?? 0} disp.`,
                  }))}
                />
              </Campo>
            ) : (
              <Campo rotulo="Descrição">
                <input
                  className="field"
                  value={item.descricao}
                  placeholder="Ex.: Troca de óleo"
                  onChange={(e) => trocar(i, { descricao: e.target.value })}
                />
              </Campo>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Quantidade">
                <input
                  className="field"
                  inputMode="numeric"
                  value={String(item.quantidade)}
                  onChange={(e) => trocar(i, { quantidade: comoNumero(e.target.value) })}
                />
              </Campo>
              <Campo rotulo="Valor unitário (R$)">
                <input
                  className="field"
                  inputMode="decimal"
                  value={String(item.valorUnitario)}
                  onChange={(e) => trocar(i, { valorUnitario: comoNumero(e.target.value) })}
                />
              </Campo>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={() =>
              setItens((a) => [...a, { descricao: '', tipo: 'MaoDeObra', quantidade: 1, valorUnitario: 0 }])
            }
          >
            + Adicionar item
          </button>
          <p className="text-sm text-ink-soft">
            Total: <span className="font-semibold text-ink">{moeda(total)}</span>
          </p>
        </div>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Registrando…' : 'Registrar diagnóstico'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalRejeicao({
  aberto,
  aoFechar,
  aoRejeitar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoRejeitar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('Cliente não autorizou o serviço');
  const [ocupado, setOcupado] = useState(false);

  // Modal e não Confirmacao: a rejeição carrega um motivo, que vai no evento e
  // aparece no histórico da ordem. Confirmacao é só sim/não, sem campo.
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      await aoRejeitar(motivo.trim() || 'Cliente não autorizou o serviço');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo="Rejeitar o orçamento"
      descricao="A saga compensa: cancela o orçamento e a ordem. Sem pagamento feito, não há estorno a emitir."
      aberto={aberto}
      aoFechar={aoFechar}
    >
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Motivo" dica="Vai no evento e aparece no histórico da ordem.">
          <input className="field" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
        <button type="submit" className="btn-ghost w-full py-2 text-sm" disabled={ocupado}>
          {ocupado ? 'Rejeitando…' : 'Rejeitar orçamento'}
        </button>
      </form>
    </Modal>
  );
}
