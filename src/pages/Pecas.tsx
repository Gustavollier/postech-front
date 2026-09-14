import { useState } from 'react';
import { api, comoLista, ErroApi } from '../lib/api';
import { useDados } from '../lib/useDados';
import { ehGerente } from '../lib/auth';
import { useAuth } from '../lib/auth';
import { moeda, numero, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Vazio } from '../components/Base';
import { Aviso, Campo, Confirmacao, Modal } from '../components/Form';
import { IconeAtualizar } from '../components/Icones';

/** Estoque baixo é condição de atenção — cor de status, sempre com rótulo junto. */
function nivel(qtd: number | null) {
  if (qtd === null) return { rotulo: '—', cor: '#6b7482' };
  if (qtd === 0) return { rotulo: 'sem estoque', cor: '#e66767' };
  if (qtd <= 10) return { rotulo: 'estoque baixo', cor: '#c98500' };
  return { rotulo: 'em estoque', cor: '#199e70' };
}

export default function Pecas() {
  const { dados, erro, carregando, recarregar } = useDados<Registro[]>(async () => comoLista(await api.pecas()));
  const { sessao } = useAuth();
  const gerente = ehGerente(sessao);
  const [nova, setNova] = useState(false);
  const [edicao, setEdicao] = useState<Registro | null>(null);
  const [exclusao, setExclusao] = useState<Registro | null>(null);
  const [ajuste, setAjuste] = useState<Registro | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);

  const pecas = dados ?? [];

  return (
    <>
      <Cabecalho
        titulo="Peças e insumos"
        descricao="Catálogo e disponibilidade em estoque."
        acao={
          <div className="flex gap-2">
            <button onClick={recarregar} className="btn-ghost px-3 py-2 text-xs" disabled={carregando}>
              <IconeAtualizar className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button onClick={() => setNova(true)} className="btn-primary px-4 py-2 text-xs">
              + Nova peça
            </button>
          </div>
        }
      />

      {aviso && (
        <div className="mb-5">
          <Aviso tipo={aviso.tipo} texto={aviso.texto} />
        </div>
      )}

      {erro && <Erro mensagem={erro} aoTentar={recarregar} />}
      {carregando && !erro && <Esqueleto linhas={4} />}
      {!carregando && !erro && pecas.length === 0 && (
        <Vazio titulo="Catálogo vazio" descricao="Cadastre a primeira peça do estoque." />
      )}

      {pecas.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-mute">
                  <th className="px-4 py-3 font-semibold">Peça</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Código</th>
                  <th className="px-4 py-3 text-right font-semibold">Preço</th>
                  <th className="px-4 py-3 text-right font-semibold">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {pecas.map((p, i) => {
                  const qtd = numero(p, 'quantidadeEstoque', 'QuantidadeEstoque');
                  const n = nivel(qtd);
                  return (
                    <tr key={String(numero(p, 'id', 'Id') ?? i)} className="border-b border-line/50 last:border-0 hover:bg-raised/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{texto(p, 'nome', 'Nome')}</p>
                        <p className="text-xs text-ink-mute">{texto(p, 'marca', 'Marca')}</p>
                      </td>
                      <td className="hidden px-4 py-3 font-mono text-xs text-ink-soft sm:table-cell">
                        {texto(p, 'codigo', 'Codigo')}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {moeda(numero(p, 'preco', 'Preco'))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-semibold tabular-nums">{qtd ?? '—'}</span>
                          <span
                            className="hidden whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase sm:inline"
                            style={{ background: `${n.cor}1f`, color: n.cor }}
                          >
                            {n.rotulo}
                          </span>
                          <button onClick={() => setAjuste(p)} className="btn-ghost px-2 py-1 text-[11px]">
                            estoque
                          </button>
                          {gerente && (
                            <>
                              <button onClick={() => setEdicao(p)} className="btn-ghost px-2 py-1 text-[11px]">
                                editar
                              </button>
                              <button
                                onClick={() => setExclusao(p)}
                                className="btn-ghost px-2 py-1 text-[11px] text-[#c98500] hover:border-[#c98500]/60"
                              >
                                desativar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModalNovaPeca
        aberto={nova}
        aoFechar={() => setNova(false)}
        aoCriar={() => {
          setNova(false);
          setAviso({ tipo: 'ok', texto: 'Peça cadastrada no catálogo.' });
          void recarregar();
        }}
      />

      <ModalPeca
        peca={edicao}
        aoFechar={() => setEdicao(null)}
        aoSalvar={() => {
          setEdicao(null);
          setAviso({ tipo: 'ok', texto: 'Peça atualizada.' });
          void recarregar();
        }}
      />

      <ModalExcluirPeca
        peca={exclusao}
        aoFechar={() => setExclusao(null)}
        aoExcluir={() => {
          setExclusao(null);
          setAviso({ tipo: 'ok', texto: 'Peça removida do catálogo.' });
          void recarregar();
        }}
      />

      <ModalAjuste
        peca={ajuste}
        aoFechar={() => setAjuste(null)}
        aoAjustar={() => {
          setAjuste(null);
          setAviso({ tipo: 'ok', texto: 'Estoque ajustado.' });
          void recarregar();
        }}
      />
    </>
  );
}

function ModalNovaPeca({ aberto, aoFechar, aoCriar }: { aberto: boolean; aoFechar: () => void; aoCriar: () => void }) {
  const [nome, setNome] = useState('');
  const [marca, setMarca] = useState('');
  const [codigo, setCodigo] = useState('');
  const [preco, setPreco] = useState('');
  const [estoque, setEstoque] = useState('0');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await api.criarPeca({
        nome,
        marca: marca || null,
        codigo: codigo || null,
        preco: Number(preco.replace(',', '.')),
        // O domínio não define um enum para unidade de medida — é um inteiro
        // livre, e todo o catálogo existente usa 0. Mantemos o mesmo valor em
        // vez de inventar uma semântica que a API não declara.
        unidadeMedida: 0,
        quantidadeEstoque: Number(estoque),
      });
      setNome('');
      setMarca('');
      setCodigo('');
      setPreco('');
      setEstoque('0');
      aoCriar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível cadastrar a peça.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Nova peça" descricao="Entra no catálogo e fica disponível para lançar nas ordens." aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome">
          <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Marca">
            <input className="field" value={marca} onChange={(e) => setMarca(e.target.value)} />
          </Campo>
          <Campo rotulo="Código">
            <input className="field font-mono" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Preço (R$)">
            <input
              className="field"
              type="number"
              step="0.01"
              min="0"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              required
            />
          </Campo>
          <Campo rotulo="Estoque inicial">
            <input
              className="field"
              type="number"
              min="0"
              value={estoque}
              onChange={(e) => setEstoque(e.target.value)}
              required
            />
          </Campo>
        </div>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalAjuste({
  peca,
  aoFechar,
  aoAjustar,
}: {
  peca: Registro | null;
  aoFechar: () => void;
  aoAjustar: () => void;
}) {
  const [quantidade, setQuantidade] = useState('0');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const atual = peca ? numero(peca, 'quantidadeEstoque', 'QuantidadeEstoque') : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const id = numero(peca ?? {}, 'id', 'Id');
    if (id === null) return;

    setErro(null);
    setSalvando(true);
    try {
      await api.ajustarEstoque(id, Number(quantidade));
      setQuantidade('0');
      aoAjustar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível ajustar o estoque.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Ajustar estoque"
      descricao={peca ? `${texto(peca, 'nome', 'Nome')} · ${atual ?? '—'} em estoque` : ''}
      aberto={peca !== null}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nova quantidade">
          <input
            className="field"
            type="number"
            min="0"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
            autoFocus
          />
        </Campo>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Ajustar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Edição da peça. O PUT exige o registro inteiro, não só o que mudou. */
function ModalPeca({
  peca,
  aoFechar,
  aoSalvar,
}: {
  peca: Registro | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [campos, setCampos] = useState({ nome: '', marca: '', codigo: '', preco: '', estoque: '0' });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState<number | null>(null);

  // Preenche a partir da peça escolhida, uma vez por peça, sem efeito extra.
  const id = peca ? numero(peca, 'id', 'Id') : null;
  if (peca && id !== carregado) {
    setCarregado(id);
    setCampos({
      nome: texto(peca, 'nome', 'Nome').replace('—', ''),
      marca: texto(peca, 'marca', 'Marca').replace('—', ''),
      codigo: texto(peca, 'codigo', 'Codigo').replace('—', ''),
      preco: String(numero(peca, 'preco', 'Preco') ?? ''),
      estoque: String(numero(peca, 'quantidadeEstoque', 'QuantidadeEstoque') ?? 0),
    });
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (id === null) return;
    setErro(null);
    setSalvando(true);
    try {
      await api.atualizarPeca(id, {
        nome: campos.nome,
        marca: campos.marca || null,
        codigo: campos.codigo || null,
        preco: Number(campos.preco.replace(',', '.')),
        unidadeMedida: numero(peca ?? {}, 'unidadeMedida', 'UnidadeMedida') ?? 0,
        quantidadeEstoque: Number(campos.estoque),
      });
      aoSalvar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível salvar a peça.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Editar peça" descricao="Alterações valem para os próximos lançamentos." aberto={peca !== null} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome">
          <input className="field" value={campos.nome} onChange={(e) => setCampos({ ...campos, nome: e.target.value })} required />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Marca">
            <input className="field" value={campos.marca} onChange={(e) => setCampos({ ...campos, marca: e.target.value })} />
          </Campo>
          <Campo rotulo="Código">
            <input className="field font-mono" value={campos.codigo} onChange={(e) => setCampos({ ...campos, codigo: e.target.value })} />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Preço (R$)">
            <input
              className="field"
              type="number"
              step="0.01"
              min="0"
              value={campos.preco}
              onChange={(e) => setCampos({ ...campos, preco: e.target.value })}
              required
            />
          </Campo>
          <Campo rotulo="Estoque">
            <input
              className="field"
              type="number"
              min="0"
              value={campos.estoque}
              onChange={(e) => setCampos({ ...campos, estoque: e.target.value })}
              required
            />
          </Campo>
        </div>

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

function ModalExcluirPeca({
  peca,
  aoFechar,
  aoExcluir,
}: {
  peca: Registro | null;
  aoFechar: () => void;
  aoExcluir: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    const id = numero(peca ?? {}, 'id', 'Id');
    if (id === null) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.excluirPeca(id);
      aoExcluir();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível excluir a peça.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Confirmacao
      titulo="Desativar peça"
      descricao={peca ? `${texto(peca, 'nome', 'Nome')} sai do catálogo e deixa de aparecer no lançamento de itens.` : ''}
      tom="desativar"
      aberto={peca !== null}
      ocupado={ocupado}
      erro={erro}
      aoFechar={aoFechar}
      aoConfirmar={confirmar}
    />
  );
}
