import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, comoLista, ErroApi } from '../lib/api';
import { useDados } from '../lib/useDados';
import { ehGerente, useAuth } from '../lib/auth';
import { useCatalogos, useRotulosOrdem } from '../lib/useCatalogos';
import { dataCurta, ehPecaItem, moeda, numero, statusPorId, statusPorNome, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Selo, Vazio } from '../components/Base';
import { Aviso, Campo, Confirmacao, Modal, Selecao } from '../components/Form';
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
  const gerente = ehGerente(sessao);
  const navegar = useNavigate();

  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [modalItem, setModalItem] = useState(false);
  const [itemEmEdicao, setItemEmEdicao] = useState<Registro | null>(null);
  const [itemParaRemover, setItemParaRemover] = useState<Registro | null>(null);
  const [itemAberto, setItemAberto] = useState<number | null>(null);
  const [editandoOrdem, setEditandoOrdem] = useState(false);
  const [excluindoOrdem, setExcluindoOrdem] = useState(false);

  const ordem = useDados<Registro>(() => api.ordem(idOS), [idOS]);
  const itens = useDados<Registro[]>(async () => comoLista(await api.itens(idOS)), [idOS]);
  // O orçamento só existe depois de calculado: 404 aqui é estado normal.
  const orcamento = useDados<Registro | null>(
    async () => api.orcamento(idOS).catch(() => null),
    [idOS],
  );

  // O total vem da rota de valor da API, e nao de uma soma feita aqui: quem
  // sabe somar item e orcamento e o dominio.
  const valor = useDados<Registro | null>(async () => api.valorDaOrdem(idOS).catch(() => null), [idOS]);
  // Historico de status: rota publica, e o acompanhamento por link.
  const historico = useDados<Registro | null>(async () => api.statusDaOrdem(idOS).catch(() => null), [idOS]);

  const catalogos = useCatalogos();
  const rotulo = useRotulosOrdem(ordem.dados ? [ordem.dados] : []);

  const recarregarTudo = useCallback(() => {
    void ordem.recarregar();
    void itens.recarregar();
    void orcamento.recarregar();
    void valor.recarregar();
    void historico.recarregar();
  }, [ordem, itens, orcamento, valor, historico]);

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
                <p className="text-sm font-semibold">{rotulo.titulo(o)}</p>
                <p className="mt-0.5 text-xs text-ink-mute">
                  {ehCliente ? '' : `Responsável: ${rotulo.responsavel(o)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {valor.dados && (
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute">Valor da ordem</p>
                    <p className="text-lg font-bold tabular-nums">{moeda(numero(valor.dados, 'valor', 'Valor'))}</p>
                  </div>
                )}
                <Selo status={status} />
              </div>
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

            <div className="mt-4 flex flex-wrap gap-2">
              {!ehCliente && proximo && (
                <button
                  onClick={() =>
                    executar(
                      () => api.atualizarStatus(idOS, numero(o, 'idFuncionario', 'funcionarioId') ?? 1, status + 1),
                      `Ordem movida para ${proximo.nome}.`,
                    )
                  }
                  disabled={ocupado}
                  className="btn-primary"
                >
                  Avançar para {proximo.nome}
                </button>
              )}
              {gerente && (
                <>
                  <button onClick={() => setEditandoOrdem(true)} className="btn-ghost">
                    Reatribuir
                  </button>
                  <button
                    onClick={() => setExcluindoOrdem(true)}
                    className="btn-ghost text-[#e66767] hover:border-[#e66767]/60"
                  >
                    Excluir ordem
                  </button>
                </>
              )}
            </div>
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
                const ehPeca = ehPecaItem(it);
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
                      {/* O catálogo de peças e a lista da equipe são da operação: o
                          cliente recebe 403 neles. Para ele, um id cru na tela não
                          diz nada — mostramos o que o item é, sem o id interno. */}
                      {ehCliente
                        ? ehPeca
                          ? 'Peça aplicada no serviço'
                          : 'Horas de serviço'
                        : ehPeca
                          ? catalogos.nomePeca(numero(it, 'idPeca', 'IdPeca'))
                          : catalogos.nomeFuncionario(numero(it, 'idFuncionario', 'IdFuncionario'))}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {ehPeca
                        ? `×${texto(it, 'quantidadeItem', 'QuantidadeItem')}`
                        : `${texto(it, 'quantidadeItem', 'QuantidadeItem')} h`}
                    </span>
                    {!ehCliente && (
                      <button
                        onClick={() => setItemAberto(numero(it, 'id', 'Id'))}
                        className="btn-ghost px-2 py-1 text-[11px]"
                      >
                        ver
                      </button>
                    )}
                    {gerente && (
                      <>
                        <button onClick={() => setItemEmEdicao(it)} className="btn-ghost px-2 py-1 text-[11px]">
                          editar
                        </button>
                        <button
                          onClick={() => setItemParaRemover(it)}
                          className="btn-ghost px-2 py-1 text-[11px] text-[#e66767] hover:border-[#e66767]/60"
                        >
                          remover
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------------- Histórico ---------------- */}
          <section className="card mb-5 p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">Histórico de status</h2>
              <span className="text-xs text-ink-mute">
                {historico.dados ? statusPorNome(texto(historico.dados, 'statusAtual', 'StatusAtual')).nome : '—'}
              </span>
            </div>

            {historico.carregando && <Esqueleto linhas={2} />}
            {!historico.carregando && !historico.dados && (
              <p className="text-sm text-ink-soft">Sem histórico registrado para esta ordem.</p>
            )}

            <ol className="space-y-0">
              {comoLista(historico.dados?.historico ?? historico.dados?.Historico ?? []).map((h, i, todos) => {
                const st = statusPorNome(texto(h, 'statusAtual', 'StatusAtual'));
                return (
                  <li key={numero(h, 'id', 'Id') ?? i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: st.cor }} />
                      {i < todos.length - 1 && <span className="w-px flex-1 bg-line" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-4">
                      <p className="text-sm font-medium">{st.nome}</p>
                      <p className="text-xs text-ink-mute">
                        {dataCurta(texto(h, 'updatedAt', 'UpdatedAt'))} · por{' '}
                        {catalogos.nomeFuncionario(numero(h, 'idFuncionario', 'IdFuncionario'))}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
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

          <ModalOrdem
            aberto={editandoOrdem}
            ordem={o}
            idOS={idOS}
            aoFechar={() => setEditandoOrdem(false)}
            aoSalvar={() => {
              setEditandoOrdem(false);
              setAviso({ tipo: 'ok', texto: 'Ordem reatribuída.' });
              recarregarTudo();
            }}
          />

          <ModalExcluirOrdem
            aberto={excluindoOrdem}
            idOS={idOS}
            aoFechar={() => setExcluindoOrdem(false)}
            aoExcluir={() => navegar('/ordens')}
          />

          <ModalDetalheItem idOS={idOS} id={itemAberto} aoFechar={() => setItemAberto(null)} />

          <ModalEditarItem
            idOS={idOS}
            item={itemEmEdicao}
            aoFechar={() => setItemEmEdicao(null)}
            aoSalvar={() => {
              setItemEmEdicao(null);
              setAviso({ tipo: 'ok', texto: 'Item atualizado. Recalcule o orçamento para refletir o novo valor.' });
              recarregarTudo();
            }}
          />

          <ModalRemoverItem
            idOS={idOS}
            item={itemParaRemover}
            aoFechar={() => setItemParaRemover(null)}
            aoRemover={() => {
              setItemParaRemover(null);
              setAviso({ tipo: 'ok', texto: 'Item removido. Recalcule o orçamento.' });
              recarregarTudo();
            }}
          />

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

/** Reatribuição: troca cliente, veículo e responsável da ordem já aberta. */
function ModalOrdem({
  aberto,
  ordem,
  idOS,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  ordem: Registro;
  idOS: number;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [cliente, setCliente] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [funcionario, setFuncionario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [preenchido, setPreenchido] = useState(false);

  if (aberto && !preenchido) {
    setPreenchido(true);
    setCliente(String(numero(ordem, 'idCliente', 'clienteId') ?? ''));
    setVeiculo(String(numero(ordem, 'idVeiculo', 'veiculoId') ?? ''));
    setFuncionario(String(numero(ordem, 'idFuncionario', 'funcionarioId') ?? ''));
    setErro(null);
  }
  if (!aberto && preenchido) setPreenchido(false);

  const clientes = useDados<Registro[]>(async () => (aberto ? comoLista(await api.clientes()) : []), [aberto]);
  const funcionarios = useDados<Registro[]>(async () => (aberto ? comoLista(await api.funcionarios()) : []), [aberto]);
  const veiculos = useDados<Registro[]>(
    async () => (cliente ? comoLista(await api.veiculosDoCliente(Number(cliente))) : []),
    [cliente],
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente || !veiculo || !funcionario) return setErro('Selecione cliente, veículo e responsável.');

    setErro(null);
    setSalvando(true);
    try {
      await api.atualizarOrdem(idOS, {
        idCliente: Number(cliente),
        idVeiculo: Number(veiculo),
        idFuncionario: Number(funcionario),
      });
      aoSalvar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível reatribuir a ordem.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Reatribuir ordem"
      descricao="Muda de quem é a ordem, qual carro e quem responde por ela. O status não muda aqui."
      aberto={aberto}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Cliente">
          <Selecao
            valor={cliente}
            aoMudar={(v) => {
              setCliente(v);
              setVeiculo('');
            }}
            vazio="Selecione o cliente…"
            opcoes={(clientes.dados ?? []).map((c) => ({
              valor: String(numero(c, 'id', 'Id') ?? ''),
              rotulo: texto(c, 'nomeCompleto', 'NomeCompleto', 'nome'),
            }))}
          />
        </Campo>

        <Campo rotulo="Veículo">
          <Selecao
            valor={veiculo}
            aoMudar={setVeiculo}
            vazio={cliente ? 'Selecione o veículo…' : 'Escolha o cliente primeiro'}
            opcoes={(veiculos.dados ?? []).map((v) => ({
              valor: String(numero(v, 'id', 'Id') ?? ''),
              rotulo: `${texto(v, 'marca', 'Marca')} ${texto(v, 'modelo', 'Modelo')} · ${texto(v, 'placa', 'Placa')}`,
            }))}
          />
        </Campo>

        <Campo rotulo="Responsável">
          <Selecao
            valor={funcionario}
            aoMudar={setFuncionario}
            vazio="Selecione o responsável…"
            opcoes={(funcionarios.dados ?? []).map((f) => ({
              valor: String(numero(f, 'id', 'Id') ?? ''),
              rotulo: `${texto(f, 'nome', 'Nome')} — ${texto(f, 'cargo', 'Cargo')}`,
            }))}
          />
        </Campo>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalExcluirOrdem({
  aberto,
  idOS,
  aoFechar,
  aoExcluir,
}: {
  aberto: boolean;
  idOS: number;
  aoFechar: () => void;
  aoExcluir: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    setErro(null);
    setOcupado(true);
    try {
      await api.excluirOrdem(idOS);
      aoExcluir();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível excluir a ordem.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Confirmacao
      titulo={`Excluir a ordem #${idOS}`}
      tom="excluir"
      descricao="Os itens, o orçamento e o histórico de status lançados nela vão junto."
      aberto={aberto}
      ocupado={ocupado}
      erro={erro}
      aoFechar={aoFechar}
      aoConfirmar={confirmar}
    />
  );
}

/** Item carregado pela rota própria, e não reaproveitado da listagem. */
function ModalDetalheItem({ idOS, id, aoFechar }: { idOS: number; id: number | null; aoFechar: () => void }) {
  const { dados, erro, carregando } = useDados<Registro | null>(
    async () => (id === null ? null : await api.item(idOS, id)),
    [idOS, id],
  );

  return (
    <Modal titulo="Item da ordem" descricao="Dados vindos da rota por id." aberto={id !== null} aoFechar={aoFechar}>
      {carregando && <Esqueleto linhas={2} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {dados && (
        <dl className="space-y-2.5 text-sm">
          {[
            ['Tipo', ehPecaItem(dados) ? 'Peça' : 'Mão de obra'],
            ['Quantidade', texto(dados, 'quantidadeItem', 'QuantidadeItem')],
            ['Peça', texto(dados, 'idPeca', 'IdPeca')],
            ['Funcionário', texto(dados, 'idFuncionario', 'IdFuncionario')],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-4 border-b border-line/60 pb-2 last:border-0">
              <dt className="text-ink-mute">{rotulo}</dt>
              <dd className="truncate font-medium">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  );
}

function ModalEditarItem({
  idOS,
  item,
  aoFechar,
  aoSalvar,
}: {
  idOS: number;
  item: Registro | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [quantidade, setQuantidade] = useState('1');
  const [referencia, setReferencia] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState<number | null>(null);

  const id = item ? numero(item, 'id', 'Id') : null;
  const ehPeca = item ? ehPecaItem(item) : false;

  if (item && id !== carregado) {
    setCarregado(id);
    setQuantidade(String(numero(item, 'quantidadeItem', 'QuantidadeItem') ?? 1));
    setReferencia(String((ehPeca ? numero(item, 'idPeca', 'IdPeca') : numero(item, 'idFuncionario', 'IdFuncionario')) ?? ''));
    setErro(null);
  }

  // O tipo do item não muda na edição: trocar peça por mão de obra é outro item.
  const pecas = useDados<Registro[]>(async () => (item && ehPeca ? comoLista(await api.pecas()) : []), [item, ehPeca]);
  const funcionarios = useDados<Registro[]>(
    async () => (item && !ehPeca ? comoLista(await api.funcionarios()) : []),
    [item, ehPeca],
  );
  const lista = ehPeca ? (pecas.dados ?? []) : (funcionarios.dados ?? []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (id === null) return;
    if (!referencia) return setErro(ehPeca ? 'Escolha a peça.' : 'Escolha o funcionário.');

    setErro(null);
    setSalvando(true);
    try {
      await api.atualizarItem(idOS, id, {
        tipoItem: ehPeca ? 1 : 0,
        quantidadeItem: Number(quantidade),
        idPeca: ehPeca ? Number(referencia) : null,
        idFuncionario: ehPeca ? null : Number(referencia),
      });
      aoSalvar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível salvar o item.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={ehPeca ? 'Editar peça lançada' : 'Editar mão de obra'}
      descricao="O tipo do item não muda aqui — remova e lance de novo, se for o caso."
      aberto={item !== null}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar} className="space-y-4">
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
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalRemoverItem({
  idOS,
  item,
  aoFechar,
  aoRemover,
}: {
  idOS: number;
  item: Registro | null;
  aoFechar: () => void;
  aoRemover: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    const id = item ? numero(item, 'id', 'Id') : null;
    if (id === null) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.removerItem(idOS, id);
      aoRemover();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível remover o item.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Confirmacao
      titulo="Remover item"
      descricao={
        item
          ? `${ehPecaItem(item) ? 'A peça' : 'A mão de obra'} sai da ordem. O orçamento precisa ser recalculado depois.`
          : ''
      }
      tom="excluir"
      rotuloAcao="Remover"
      aberto={item !== null}
      ocupado={ocupado}
      erro={erro}
      aoFechar={aoFechar}
      aoConfirmar={confirmar}
    />
  );
}
