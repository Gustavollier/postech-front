import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, comoLista, ErroApi } from '../lib/api';
import { useDados } from '../lib/useDados';
import { useAuth } from '../lib/auth';
import { moeda, numero, statusPorId, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Selo, Vazio } from '../components/Base';
import { Aviso, Campo, Modal, Selecao } from '../components/Form';
import { IconeAtualizar } from '../components/Icones';

/** Status do orçamento, no mesmo enum da API. */
const ORCAMENTO = [
  { id: 0, nome: 'Pendente', cor: '#c98500' },
  { id: 1, nome: 'Aprovado', cor: '#199e70' },
  { id: 2, nome: 'Rejeitado', cor: '#e66767' },
];

export default function OrdemDetalhe() {
  const { id } = useParams<{ id: string }>();
  const idOS = Number(id);
  const { sessao } = useAuth();
  const ehCliente = sessao?.tipo === 'cliente';

  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [modalItem, setModalItem] = useState(false);

  const ordem = useDados<Registro>(() => api.ordem(idOS), [idOS]);
  const itens = useDados<Registro[]>(async () => comoLista(await api.itens(idOS)), [idOS]);
  // O orçamento só existe depois de calculado: 404 aqui é estado normal.
  const orcamento = useDados<Registro | null>(
    async () => api.orcamento(idOS).catch(() => null),
    [idOS],
  );

  const recarregarTudo = useCallback(() => {
    void ordem.recarregar();
    void itens.recarregar();
    void orcamento.recarregar();
  }, [ordem, itens, orcamento]);

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      setAviso({ tipo: 'ok', texto: sucesso });
      recarregarTudo();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Não foi possível concluir.' });
    } finally {
      setOcupado(false);
    }
  }

  const o = ordem.dados;
  const status = numero(o ?? {}, 'status', 'Status') ?? 0;
  const proximo = status < 5 ? statusPorId(status + 1) : null;
  const statusOrc = orcamento.dados ? numero(orcamento.dados, 'status', 'Status') : null;
  const orcInfo = ORCAMENTO.find((x) => x.id === statusOrc);

  return (
    <>
      <Cabecalho
        titulo={`Ordem #${id}`}
        descricao={ehCliente ? 'Detalhes do serviço no seu veículo.' : 'Itens, orçamento e andamento.'}
        acao={
          <div className="flex gap-2">
            <Link to="/ordens" className="btn-ghost px-3 py-2 text-xs">
              ← Voltar
            </Link>
            <button onClick={recarregarTudo} className="btn-ghost px-3 py-2 text-xs">
              <IconeAtualizar className="h-4 w-4" />
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
      {ordem.carregando && <Esqueleto linhas={3} />}

      {o && (
        <>
          <section className="card mb-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {ehCliente
                    ? `Veículo ${texto(o, 'idVeiculo', 'veiculoId')}`
                    : `Cliente ${texto(o, 'idCliente', 'clienteId')} · Veículo ${texto(o, 'idVeiculo', 'veiculoId')}`}
                </p>
                <p className="mt-0.5 text-xs text-ink-mute">
                  {ehCliente ? '' : `Responsável ${texto(o, 'idFuncionario', 'funcionarioId')}`}
                </p>
              </div>
              <Selo status={status} />
            </div>

            <div className="mt-4 flex gap-[2px]">
              {[0, 1, 2, 3, 4, 5].map((st) => (
                <div
                  key={st}
                  className="h-1.5 flex-1 rounded-full"
                  style={{ background: st <= status ? statusPorId(st).cor : '#232935' }}
                  title={statusPorId(st).nome}
                />
              ))}
            </div>

            {!ehCliente && proximo && (
              <button
                onClick={() =>
                  executar(
                    () => api.atualizarStatus(idOS, numero(o, 'idFuncionario', 'funcionarioId') ?? 1, status + 1),
                    `Ordem movida para ${proximo.nome}.`,
                  )
                }
                disabled={ocupado}
                className="btn-primary mt-4 w-full sm:w-auto"
              >
                Avançar para {proximo.nome}
              </button>
            )}
          </section>

          {/* ---------------- Itens ---------------- */}
          <section className="mb-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Itens do serviço</h2>
              {!ehCliente && (
                <button onClick={() => setModalItem(true)} className="btn-ghost px-3 py-1.5 text-xs">
                  + Adicionar item
                </button>
              )}
            </div>

            {itens.carregando && <Esqueleto linhas={2} />}
            {!itens.carregando && (itens.dados ?? []).length === 0 && (
              <Vazio
                titulo="Nenhum item lançado"
                descricao={
                  ehCliente
                    ? 'A oficina ainda não lançou peças ou mão de obra nesta ordem.'
                    : 'Adicione mão de obra e peças para poder calcular o orçamento.'
                }
              />
            )}

            <div className="space-y-2">
              {(itens.dados ?? []).map((it, i) => {
                const tipo = numero(it, 'tipoItem', 'TipoItem');
                const ehPeca = tipo === 1;
                return (
                  <div key={numero(it, 'id', 'Id') ?? i} className="card flex items-center gap-3 px-4 py-3">
                    <span
                      className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase"
                      style={{
                        background: ehPeca ? '#3987e51f' : '#c985001f',
                        color: ehPeca ? '#3987e5' : '#c98500',
                      }}
                    >
                      {ehPeca ? 'Peça' : 'Mão de obra'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {ehPeca
                        ? `Peça ${texto(it, 'idPeca', 'IdPeca')}`
                        : `Funcionário ${texto(it, 'idFuncionario', 'IdFuncionario')}`}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      ×{texto(it, 'quantidadeItem', 'QuantidadeItem')}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------------- Orçamento ---------------- */}
          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Orçamento</h2>
              {orcInfo && (
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ background: `${orcInfo.cor}1f`, color: orcInfo.cor }}
                >
                  {orcInfo.nome}
                </span>
              )}
            </div>

            {orcamento.carregando && <Esqueleto linhas={1} />}

            {!orcamento.carregando && !orcamento.dados && (
              <p className="text-sm text-ink-soft">
                Ainda não há orçamento para esta ordem.
                {!ehCliente && ' Calcule a partir dos itens lançados.'}
              </p>
            )}

            {orcamento.dados && (
              <dl className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Mão de obra', numero(orcamento.dados, 'valorMaoDeObra', 'ValorMaoDeObra')],
                  ['Peças', numero(orcamento.dados, 'valorPecas', 'ValorPecas')],
                  ['Total', numero(orcamento.dados, 'valorTotal', 'ValorTotal')],
                ].map(([rotulo, valor], i) => (
                  <div key={String(rotulo)} className="rounded-xl border border-line bg-raised/50 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">{rotulo}</dt>
                    <dd className={`mt-1 tabular-nums ${i === 2 ? 'text-xl font-bold' : 'text-base font-semibold'}`}>
                      {moeda(valor as number | null)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {!ehCliente && (
                <>
                  <button
                    onClick={() => executar(() => api.calcularOrcamento(idOS), 'Orçamento calculado a partir dos itens.')}
                    disabled={ocupado}
                    className="btn-ghost"
                  >
                    Calcular
                  </button>
                  <button
                    onClick={() => executar(() => api.enviarOrcamento(idOS), 'Orçamento enviado ao cliente.')}
                    disabled={ocupado || !orcamento.dados}
                    className="btn-primary"
                  >
                    Enviar ao cliente
                  </button>
                </>
              )}

              {/* A única escrita que um cliente faz no sistema. */}
              {ehCliente && orcamento.dados && statusOrc === 0 && (
                <>
                  <button
                    onClick={() => executar(() => api.responderOrcamento(idOS, 1), 'Orçamento aprovado. A oficina foi avisada.')}
                    disabled={ocupado}
                    className="btn-primary"
                  >
                    Aprovar orçamento
                  </button>
                  <button
                    onClick={() => executar(() => api.responderOrcamento(idOS, 2), 'Orçamento recusado.')}
                    disabled={ocupado}
                    className="btn-ghost"
                  >
                    Recusar
                  </button>
                </>
              )}
            </div>
          </section>

          {!ehCliente && (
            <ModalItem
              aberto={modalItem}
              aoFechar={() => setModalItem(false)}
              idOS={idOS}
              aoSalvar={(msg) => {
                setModalItem(false);
                setAviso({ tipo: 'ok', texto: msg });
                recarregarTudo();
              }}
            />
          )}
        </>
      )}
    </>
  );
}

function ModalItem({
  aberto,
  aoFechar,
  idOS,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  idOS: number;
  aoSalvar: (msg: string) => void;
}) {
  const [tipo, setTipo] = useState('1');
  const [quantidade, setQuantidade] = useState('1');
  const [referencia, setReferencia] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const pecas = useDados<Registro[]>(async () => (aberto ? comoLista(await api.pecas()) : []), [aberto]);
  const funcionarios = useDados<Registro[]>(
    async () => (aberto ? comoLista(await api.funcionarios()) : []),
    [aberto],
  );

  const ehPeca = tipo === '1';
  const lista = ehPeca ? (pecas.dados ?? []) : (funcionarios.dados ?? []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!referencia) return setErro(ehPeca ? 'Escolha a peça.' : 'Escolha o funcionário.');

    setSalvando(true);
    try {
      await api.adicionarItem(idOS, {
        tipoItem: Number(tipo),
        quantidadeItem: Number(quantidade),
        idPeca: ehPeca ? Number(referencia) : null,
        idFuncionario: ehPeca ? null : Number(referencia),
      });
      aoSalvar(ehPeca ? 'Peça lançada na ordem.' : 'Mão de obra lançada na ordem.');
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível adicionar o item.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Adicionar item"
      descricao="Peças e horas de mão de obra compõem o valor do orçamento."
      aberto={aberto}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Tipo">
          <Selecao
            valor={tipo}
            aoMudar={(v) => {
              setTipo(v);
              setReferencia('');
            }}
            opcoes={[
              { valor: '1', rotulo: 'Peça' },
              { valor: '0', rotulo: 'Mão de obra' },
            ]}
          />
        </Campo>

        <Campo rotulo={ehPeca ? 'Peça' : 'Funcionário'}>
          <Selecao
            valor={referencia}
            aoMudar={setReferencia}
            vazio={ehPeca ? 'Selecione a peça…' : 'Selecione o funcionário…'}
            opcoes={lista.map((r) => ({
              valor: String(numero(r, 'id', 'Id') ?? ''),
              rotulo: ehPeca
                ? `${texto(r, 'nome', 'Nome')} — ${moeda(numero(r, 'preco', 'Preco'))}`
                : `${texto(r, 'nome', 'Nome')} — ${texto(r, 'cargo', 'Cargo')}`,
            }))}
          />
        </Campo>

        <Campo rotulo={ehPeca ? 'Quantidade' : 'Horas'}>
          <input
            className="field"
            type="number"
            min="1"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
          />
        </Campo>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Adicionar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
