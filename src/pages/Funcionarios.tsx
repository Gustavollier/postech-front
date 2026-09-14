import { useState } from 'react';
import { api, comoLista, ErroApi } from '../lib/api';
import { useDados } from '../lib/useDados';
import { ehGerente, useAuth } from '../lib/auth';
import { moeda, numero, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Vazio } from '../components/Base';
import { Aviso, Campo, Confirmacao, Modal, Selecao } from '../components/Form';
import { IconeAtualizar } from '../components/Icones';

/** Cargos, no mesmo enum da API. */
const CARGOS = [
  { id: 0, nome: 'Mecânico' },
  { id: 1, nome: 'Recepcionista' },
  { id: 2, nome: 'Gerente' },
  { id: 3, nome: 'Estoquista' },
  { id: 4, nome: 'Eletricista' },
  { id: 5, nome: 'Lavador' },
  { id: 6, nome: 'Supervisor' },
];

const idDoCargo = (nome: string) => CARGOS.find((c) => c.nome.toLowerCase() === nome.toLowerCase())?.id ?? 0;

export default function Funcionarios() {
  const { sessao } = useAuth();
  const gerente = ehGerente(sessao);

  const { dados, erro, carregando, recarregar } = useDados<Registro[]>(async () =>
    comoLista(await api.funcionarios()),
  );

  const [modoBusca, setModoBusca] = useState<'nome' | 'cpf'>('nome');
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState<{ carregando: boolean; erro: string | null; achado: Registro | null } | null>(null);

  const [novo, setNovo] = useState(false);
  const [detalhe, setDetalhe] = useState<number | null>(null);
  const [edicao, setEdicao] = useState<Registro | null>(null);
  const [exclusao, setExclusao] = useState<Registro | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);

  const funcionarios = dados ?? [];

  /**
   * A busca é no servidor, não um filtro da lista já carregada: são as rotas
   * /Funcionario/nome e /Funcionario/cpf, que devolvem um funcionário só.
   */
  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = termo.trim();
    if (!q) return setBusca(null);

    setBusca({ carregando: true, erro: null, achado: null });
    try {
      const achado = modoBusca === 'cpf' ? await api.funcionarioPorCpf(q) : await api.funcionarioPorNome(q);
      setBusca({ carregando: false, erro: null, achado });
    } catch (e2) {
      setBusca({
        carregando: false,
        erro: e2 instanceof ErroApi && e2.status === 404 ? 'Nenhum funcionário com esse dado.' : 'Falha na busca.',
        achado: null,
      });
    }
  }

  function limparBusca() {
    setTermo('');
    setBusca(null);
  }

  const visiveis = busca?.achado ? [busca.achado] : funcionarios;

  return (
    <>
      <Cabecalho
        titulo="Equipe"
        descricao="Quem trabalha na oficina e o custo de cada hora."
        acao={
          <div className="flex gap-2">
            <button onClick={recarregar} className="btn-ghost px-3 py-2 text-xs" disabled={carregando}>
              <IconeAtualizar className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            {gerente && (
              <button onClick={() => setNovo(true)} className="btn-primary px-4 py-2 text-xs">
                + Novo funcionário
              </button>
            )}
          </div>
        }
      />

      {aviso && (
        <div className="mb-5">
          <Aviso tipo={aviso.tipo} texto={aviso.texto} />
        </div>
      )}

      <form onSubmit={buscar} className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line bg-panel p-1">
          {(['nome', 'cpf'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModoBusca(m)}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                modoBusca === m ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink',
              ].join(' ')}
            >
              {m === 'nome' ? 'Nome' : 'CPF'}
            </button>
          ))}
        </div>
        <input
          id="busca-funcionario"
          className="field h-10 flex-1 py-2 sm:max-w-xs"
          placeholder={modoBusca === 'nome' ? 'Buscar pelo nome…' : 'Buscar pelo CPF…'}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          inputMode={modoBusca === 'cpf' ? 'numeric' : 'text'}
        />
        <button type="submit" className="btn-ghost px-4 py-2 text-xs" disabled={busca?.carregando}>
          {busca?.carregando ? 'Buscando…' : 'Buscar'}
        </button>
        {busca && (
          <button type="button" onClick={limparBusca} className="btn-ghost px-3 py-2 text-xs">
            Limpar
          </button>
        )}
      </form>

      {busca?.erro && <Aviso tipo="erro" texto={busca.erro} />}
      {busca?.achado && (
        <p className="mb-3 text-xs text-ink-mute">Resultado da busca no servidor — “Limpar” volta para a lista completa.</p>
      )}

      {erro && !busca && <Erro mensagem={erro} aoTentar={recarregar} />}
      {carregando && !erro && !busca && <Esqueleto linhas={4} />}
      {!carregando && !erro && !busca && funcionarios.length === 0 && (
        <Vazio titulo="Nenhum funcionário" descricao="Cadastre o primeiro integrante da equipe." />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visiveis.map((f, i) => {
          const id = numero(f, 'id', 'Id');
          return (
            <article key={String(id ?? i)} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{texto(f, 'nome', 'Nome')}</p>
                  <p className="truncate text-xs text-ink-mute">{texto(f, 'contato', 'Contato')}</p>
                </div>
                <span className="shrink-0 rounded-full bg-brand/12 px-2.5 py-1 text-[10px] font-bold uppercase text-brand">
                  {texto(f, 'cargo', 'Cargo')}
                </span>
              </div>

              <dl className="mt-4 flex items-end justify-between border-t border-line pt-3">
                <dt className="text-xs text-ink-mute">Valor/hora</dt>
                <dd className="text-lg font-bold tabular-nums">{moeda(numero(f, 'valorHora', 'ValorHora'))}</dd>
              </dl>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => id !== null && setDetalhe(id)}
                  className="btn-ghost flex-1 py-1.5 text-xs"
                  disabled={id === null}
                >
                  Ver ficha
                </button>
                {gerente && (
                  <>
                    <button onClick={() => setEdicao(f)} className="btn-ghost px-3 py-1.5 text-xs">
                      Editar
                    </button>
                    <button
                      onClick={() => setExclusao(f)}
                      className="btn-ghost px-3 py-1.5 text-xs text-[#e66767] hover:border-[#e66767]/60"
                    >
                      Excluir
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <ModalFicha id={detalhe} aoFechar={() => setDetalhe(null)} />

      <ModalFuncionario
        aberto={novo}
        aoFechar={() => setNovo(false)}
        aoCriar={() => {
          setNovo(false);
          setAviso({ tipo: 'ok', texto: 'Funcionário cadastrado. Ele já pode entrar com o CPF e a senha definida.' });
          void recarregar();
        }}
      />

      <ModalEditar
        funcionario={edicao}
        aoFechar={() => setEdicao(null)}
        aoSalvar={() => {
          setEdicao(null);
          setAviso({ tipo: 'ok', texto: 'Cadastro atualizado.' });
          void recarregar();
          limparBusca();
        }}
      />

      <ModalExcluir
        funcionario={exclusao}
        aoFechar={() => setExclusao(null)}
        aoExcluir={() => {
          setExclusao(null);
          setAviso({ tipo: 'ok', texto: 'Funcionário removido da equipe.' });
          void recarregar();
          limparBusca();
        }}
      />
    </>
  );
}

/** Ficha carregada pela rota por id, e não reaproveitada da listagem. */
function ModalFicha({ id, aoFechar }: { id: number | null; aoFechar: () => void }) {
  const { dados, erro, carregando } = useDados<Registro | null>(
    async () => (id === null ? null : await api.funcionario(id)),
    [id],
  );

  return (
    <Modal titulo="Ficha do funcionário" descricao="Dados vindos da rota por id." aberto={id !== null} aoFechar={aoFechar}>
      {carregando && <Esqueleto linhas={2} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {dados && (
        <dl className="space-y-2.5 text-sm">
          {[
            ['Nome', texto(dados, 'nome', 'Nome')],
            ['CPF', texto(dados, 'cpf', 'CPF')],
            ['Contato', texto(dados, 'contato', 'Contato')],
            ['Cargo', texto(dados, 'cargo', 'Cargo')],
            ['Valor/hora', moeda(numero(dados, 'valorHora', 'ValorHora'))],
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

function ModalEditar({
  funcionario,
  aoFechar,
  aoSalvar,
}: {
  funcionario: Registro | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [campos, setCampos] = useState({ nome: '', contato: '', cargo: '0', valorHora: '0' });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState<number | null>(null);

  const id = funcionario ? numero(funcionario, 'id', 'Id') : null;
  if (funcionario && id !== carregado) {
    setCarregado(id);
    setCampos({
      nome: texto(funcionario, 'nome', 'Nome').replace('—', ''),
      contato: texto(funcionario, 'contato', 'Contato').replace('—', ''),
      cargo: String(idDoCargo(texto(funcionario, 'cargo', 'Cargo'))),
      valorHora: String(numero(funcionario, 'valorHora', 'ValorHora') ?? 0),
    });
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cpf = funcionario ? texto(funcionario, 'cpf', 'CPF') : '—';
    if (cpf === '—') return setErro('Este funcionário veio sem CPF, e é o CPF que identifica ele na atualização.');

    setErro(null);
    setSalvando(true);
    try {
      await api.atualizarFuncionario(cpf, {
        nome: campos.nome,
        contato: campos.contato,
        cargo: Number(campos.cargo),
        valorHora: Number(campos.valorHora),
      });
      aoSalvar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível salvar o cadastro.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Editar funcionário"
      descricao="O CPF não muda: é ele que identifica o cadastro."
      aberto={funcionario !== null}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome">
          <input className="field" value={campos.nome} onChange={(e) => setCampos({ ...campos, nome: e.target.value })} required />
        </Campo>
        <Campo rotulo="Contato">
          <input className="field" value={campos.contato} onChange={(e) => setCampos({ ...campos, contato: e.target.value })} required />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Cargo">
            <Selecao
              valor={campos.cargo}
              aoMudar={(v) => setCampos({ ...campos, cargo: v })}
              opcoes={CARGOS.map((c) => ({ valor: String(c.id), rotulo: c.nome }))}
            />
          </Campo>
          <Campo rotulo="Valor/hora (R$)">
            <input
              className="field"
              type="number"
              min="0"
              value={campos.valorHora}
              onChange={(e) => setCampos({ ...campos, valorHora: e.target.value })}
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

function ModalExcluir({
  funcionario,
  aoFechar,
  aoExcluir,
}: {
  funcionario: Registro | null;
  aoFechar: () => void;
  aoExcluir: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    const cpf = funcionario ? texto(funcionario, 'cpf', 'CPF') : '—';
    if (cpf === '—') return setErro('Sem o CPF não dá para identificar o cadastro na exclusão.');

    setErro(null);
    setOcupado(true);
    try {
      await api.excluirFuncionario(cpf);
      aoExcluir();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível excluir o funcionário.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Confirmacao
      titulo="Excluir funcionário"
      descricao={
        funcionario
          ? `${texto(funcionario, 'nome', 'Nome')} sai do banco de vez — aqui nao e desativacao como em cliente e peca. Na base atual isso so passa para quem nao tem login nem historico, o que na pratica nao acontece: o login e criado junto com o cadastro.`
          : ''
      }
      aberto={funcionario !== null}
      ocupado={ocupado}
      erro={erro}
      aoFechar={aoFechar}
      aoConfirmar={confirmar}
    />
  );
}

function ModalFuncionario({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [nome, setNome] = useState('');
  const [contato, setContato] = useState('');
  const [cpf, setCpf] = useState('');
  const [cargo, setCargo] = useState('0');
  const [valorHora, setValorHora] = useState('120');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha !== confirmacao) return setErro('A confirmação não confere com a senha.');

    setSalvando(true);
    try {
      await api.criarFuncionario({
        nome,
        contato,
        cpf: cpf.replace(/\D/g, ''),
        cargo: Number(cargo),
        valorHora: Number(valorHora),
        senha,
        confirmacaoSenha: confirmacao,
      });
      setNome('');
      setContato('');
      setCpf('');
      setSenha('');
      setConfirmacao('');
      aoCriar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível cadastrar o funcionário.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Novo funcionário"
      descricao="Ele passa a entrar no sistema com o CPF e a senha definida aqui."
      aberto={aberto}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome">
          <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="CPF" dica="O dígito verificador é validado no login.">
            <input
              className="field font-mono"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              inputMode="numeric"
              required
            />
          </Campo>
          <Campo rotulo="Contato">
            <input className="field" value={contato} onChange={(e) => setContato(e.target.value)} required />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Cargo">
            <Selecao valor={cargo} aoMudar={setCargo} opcoes={CARGOS.map((c) => ({ valor: String(c.id), rotulo: c.nome }))} />
          </Campo>
          <Campo rotulo="Valor/hora (R$)">
            <input
              className="field"
              type="number"
              min="0"
              value={valorHora}
              onChange={(e) => setValorHora(e.target.value)}
              required
            />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Senha">
            <input className="field" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Campo>
          <Campo rotulo="Confirmar senha">
            <input
              className="field"
              type="password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
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
