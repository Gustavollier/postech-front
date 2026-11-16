import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, comoLista, ErroApi, type ItemDoDiagnostico } from '../lib/api';
import { useDados } from '../lib/useDados';
import { useAuth } from '../lib/auth';
import { dataCurta, moeda, numero, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Vazio } from '../components/Base';
import { Aviso, Campo, Modal } from '../components/Form';
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
  { descricao: 'Filtro de óleo', tipo: 'MaoDeObra', quantidade: 2, valorUnitario: 38.9 },
];

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
        texto: e instanceof ErroApi ? `HTTP ${e.status} — ${e.message}` : 'A operação falhou.',
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

  return (
    <>
      <Cabecalho
        titulo={`Ordem ${idOS}`}
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
      {ordem.carregando && !ordem.erro && <Esqueleto linhas={5} />}

      {dados && (
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5">
            {/* --- A saga: por que a ordem está onde está --- */}
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Saga</h2>
                {viva && <span className="text-[11px] text-ink-mute">atualizando a cada 3 s</span>}
              </div>

              {saga === null ? (
                <p className="mt-3 text-sm text-ink-mute">
                  Sem estado de saga para esta ordem ainda.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-lg font-semibold text-brand">{texto(saga, 'passo', 'Passo')}</span>
                    <span className="text-xs text-ink-soft">
                      status da ordem: {texto(saga, 'statusDaOrdem', 'StatusDaOrdem')}
                    </span>
                  </div>

                  {saga.motivoDaCompensacao ? (
                    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-amber-300/80">Compensação</p>
                      <p className="mt-0.5 text-sm text-amber-100">
                        {texto(saga, 'motivoDaCompensacao', 'MotivoDaCompensacao')}
                      </p>
                    </div>
                  ) : null}

                  <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Par rotulo="Orçamento" valor={texto(saga, 'idOrcamento', 'IdOrcamento')} mono />
                    <Par rotulo="Pagamento" valor={texto(saga, 'idPagamento', 'IdPagamento')} mono />
                    <Par rotulo="Referência no adquirente" valor={texto(saga, 'referenciaExterna', 'ReferenciaExterna')} mono />
                    <Par rotulo="Valor" valor={moeda(numero(saga, 'valor', 'Valor'))} />
                  </dl>
                </>
              )}
            </section>

            {/* --- Orçamento, do Billing --- */}
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Orçamento</h2>

              {orcamento.dados === null ? (
                <p className="mt-3 text-sm text-ink-mute">
                  Ainda não existe: ele é montado pelo Billing quando o diagnóstico é registrado.
                </p>
              ) : (
                <>
                  <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Par rotulo="Situação" valor={texto(orcamento.dados, 'status', 'Status')} />
                    <Par rotulo="Pagamento" valor={texto(orcamento.dados, 'statusDoPagamento', 'StatusDoPagamento')} />
                    <Par rotulo="Total" valor={moeda(numero(orcamento.dados, 'valor', 'Valor'))} />
                    <Par rotulo="Criado" valor={dataCurta(texto(orcamento.dados, 'criadoEm', 'CriadoEm'))} />
                  </dl>

                  {orcamento.dados.motivoDaRecusaDoPagamento ? (
                    <p className="mt-3 text-sm text-ink-soft">
                      Recusa do adquirente: {texto(orcamento.dados, 'motivoDaRecusaDoPagamento', 'MotivoDaRecusaDoPagamento')}
                    </p>
                  ) : null}

                  <ItensDoOrcamento orcamento={orcamento.dados} />

                  {typeof orcamento.dados.urlDePagamento === 'string' && orcamento.dados.urlDePagamento ? (
                    <a
                      href={orcamento.dados.urlDePagamento}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-block rounded-lg bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/25"
                    >
                      Abrir o Pix no Mercado Pago
                    </a>
                  ) : null}
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
          <aside className="space-y-5">
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
                    <p className="mt-3 text-sm text-ink-soft">Nada a responder neste momento.</p>
                  )}
                </>
              ) : acaoDisponivel === null ? (
                <p className="mt-3 text-sm text-ink-soft">
                  {viva
                    ? 'A saga está esperando um evento, não uma ação sua.'
                    : 'A saga terminou. Nada a fazer nesta ordem.'}
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
                <Par rotulo="Status" valor={texto(dados, 'status', 'Status')} />
                <Par rotulo="Cliente" valor={texto(dados, 'idCliente', 'IdCliente')} />
                <Par rotulo="Veículo" valor={texto(dados, 'idVeiculo', 'IdVeiculo')} />
                <Par rotulo="Responsável" valor={texto(dados, 'idFuncionario', 'IdFuncionario')} />
                <Par rotulo="Aberta" valor={dataCurta(texto(dados, 'criadoEm', 'CriadoEm'))} />
                <Par rotulo="Atualizada" valor={dataCurta(texto(dados, 'atualizadoEm', 'AtualizadoEm'))} />
              </dl>
            </section>
          </aside>
        </div>
      )}

      <ModalDiagnostico
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
                <span className="ml-2 text-[11px] text-ink-mute">{texto(i, 'tipo', 'Tipo')}</span>
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
              {texto(h, 'de', 'De') === '—' ? 'Aberta' : texto(h, 'de', 'De')} →{' '}
              <span className="font-medium">{texto(h, 'para', 'Para')}</span>
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
 * O diagnóstico, que é a entrada dos itens no fluxo.
 *
 * Os itens vêm preenchidos com um par plausível porque esta tela serve também
 * à demonstração: digitar quatro campos na frente da câmera só adiciona tempo
 * morto. Todos continuam editáveis.
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

  function alterar(i: number, campo: keyof ItemDoDiagnostico, valor: string) {
    setItens((atual) =>
      atual.map((item, n) =>
        n !== i
          ? item
          : {
              ...item,
              [campo]:
                campo === 'quantidade' || campo === 'valorUnitario'
                  ? Number(valor.replace(',', '.')) || 0
                  : valor,
            },
      ),
    );
  }

  const total = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (itens.length === 0) return setErro('Um diagnóstico sem itens não gera orçamento.');

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
      descricao="Os itens viram o orçamento no Billing, por evento — não por chamada direta."
      aberto={aberto}
      aoFechar={aoFechar}
    >
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Aviso tipo="erro" texto={erro} />}

        {itens.map((item, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_5rem_7rem]">
            <Campo rotulo="Descrição">
              <input
                className="field"
                value={item.descricao}
                onChange={(e) => alterar(i, 'descricao', e.target.value)}
                required
              />
            </Campo>
            <Campo rotulo="Qtd">
              <input
                className="field"
                inputMode="numeric"
                value={String(item.quantidade)}
                onChange={(e) => alterar(i, 'quantidade', e.target.value)}
                required
              />
            </Campo>
            <Campo rotulo="Unitário">
              <input
                className="field"
                inputMode="decimal"
                value={String(item.valorUnitario)}
                onChange={(e) => alterar(i, 'valorUnitario', e.target.value)}
                required
              />
            </Campo>
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
            + Item
          </button>
          <p className="text-sm text-ink-soft">
            Total: <span className="font-semibold text-ink">{moeda(total)}</span>
          </p>
        </div>

        <button type="submit" className="btn-primary w-full py-2 text-sm" disabled={salvando}>
          {salvando ? 'Registrando…' : 'Registrar diagnóstico'}
        </button>
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
