import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, comoLista, ErroApi } from '../lib/api';
import { useOrdens } from '../lib/useOrdens';
import { useDados } from '../lib/useDados';
import { useAuth } from '../lib/auth';
import { STATUS, dataCurta, numero, statusPorId, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Selo, Vazio } from '../components/Base';
import { Aviso, Campo, Modal, Selecao } from '../components/Form';
import { IconeAtualizar } from '../components/Icones';

export default function Ordens() {
  const { sessao } = useAuth();
  const { dados, erro, carregando, recarregar, ehCliente } = useOrdens();
  const [filtro, setFiltro] = useState<number | 'todos'>('todos');
  const [busca, setBusca] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);

  const ordens = dados ?? [];

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ordens.filter((o) => {
      const s = numero(o, 'status', 'Status');
      if (filtro !== 'todos' && s !== filtro) return false;
      return !q || JSON.stringify(o).toLowerCase().includes(q);
    });
  }, [ordens, filtro, busca]);

  return (
    <>
      <Cabecalho
        titulo="Ordens de serviço"
        descricao={
          ehCliente
            ? 'O andamento dos serviços dos seus veículos.'
            : 'Acompanhe e movimente as ordens pelo fluxo da oficina.'
        }
        acao={
          <div className="flex gap-2">
            <button onClick={recarregar} className="btn-ghost px-3 py-2 text-xs" disabled={carregando}>
              <IconeAtualizar className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            {!ehCliente && (
              <button onClick={() => setNovaAberta(true)} className="btn-primary px-4 py-2 text-xs">
                + Nova ordem
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

      <div className="mb-5 space-y-3">
        <input
          className="field h-11 w-full py-2 sm:max-w-md"
          placeholder="Buscar ordem…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip ativo={filtro === 'todos'} onClick={() => setFiltro('todos')} rotulo={`Todas (${ordens.length})`} />
          {STATUS.map((s) => {
            const n = ordens.filter((o) => numero(o, 'status', 'Status') === s.id).length;
            if (n === 0) return null;
            return (
              <Chip
                key={s.id}
                ativo={filtro === s.id}
                onClick={() => setFiltro(s.id)}
                rotulo={`${s.nome} (${n})`}
                cor={s.cor}
              />
            );
          })}
        </div>
      </div>

      {erro && <Erro mensagem={erro} aoTentar={recarregar} />}
      {carregando && !erro && <Esqueleto linhas={6} />}

      {!carregando && !erro && visiveis.length === 0 && (
        <Vazio
          titulo="Nada por aqui"
          descricao={
            busca || filtro !== 'todos'
              ? 'Nenhuma ordem bate com o filtro atual.'
              : ehCliente
                ? 'Quando a oficina abrir uma ordem para um veículo seu, ela aparece aqui.'
                : 'Crie a primeira ordem de serviço para começar.'
          }
        />
      )}

      <div className="space-y-2.5">
        {visiveis.map((o, i) => {
          const id = numero(o, 'id', 'Id');
          const s = numero(o, 'status', 'Status') ?? 0;
          const cor = statusPorId(s).cor;

          return (
            <Link
              key={id ?? i}
              to={`/ordens/${id}`}
              className="card block overflow-hidden transition-colors hover:border-brand/50"
            >
              <div className="flex flex-wrap items-center gap-4 px-4 py-4">
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-mono text-sm font-bold"
                  style={{ background: `${cor}1a`, color: cor }}
                >
                  #{id ?? '?'}
                </div>

                <div className="min-w-[11rem] flex-1">
                  <p className="truncate text-sm font-semibold">
                    {ehCliente
                      ? `Veículo ${texto(o, 'idVeiculo', 'veiculoId')}`
                      : `Cliente ${texto(o, 'idCliente', 'clienteId')} · Veículo ${texto(o, 'idVeiculo', 'veiculoId')}`}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-mute">
                    {ehCliente
                      ? `Aberta em ${dataCurta(texto(o, 'criadoEm', 'CriadoEm', 'createdAt'))}`
                      : `Responsável ${texto(o, 'idFuncionario', 'funcionarioId')} · aberta em ${dataCurta(texto(o, 'criadoEm', 'CriadoEm', 'createdAt'))}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Selo status={s} />
                  <span className="text-xs text-ink-mute">detalhes →</span>
                </div>
              </div>

              <div className="flex gap-[2px] px-4 pb-3">
                {STATUS.map((st) => (
                  <div
                    key={st.id}
                    className="h-1 flex-1 rounded-full"
                    style={{ background: st.id <= s ? st.cor : '#232935' }}
                    title={st.nome}
                  />
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {!ehCliente && (
        <ModalNovaOrdem
          aberto={novaAberta}
          aoFechar={() => setNovaAberta(false)}
          funcionarioPadrao={sessao?.detalhe === 'Gerente' ? 1 : undefined}
          aoCriar={() => {
            setNovaAberta(false);
            setAviso({ tipo: 'ok', texto: 'Ordem de serviço aberta.' });
            void recarregar();
          }}
        />
      )}
    </>
  );
}

function Chip({ ativo, onClick, rotulo, cor }: { ativo: boolean; onClick: () => void; rotulo: string; cor?: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
        ativo ? 'border-transparent text-white' : 'border-line text-ink-soft hover:text-ink',
      ].join(' ')}
      style={ativo ? { background: cor ?? '#3987e5' } : undefined}
    >
      {rotulo}
    </button>
  );
}

function ModalNovaOrdem({
  aberto,
  aoFechar,
  aoCriar,
  funcionarioPadrao,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
  funcionarioPadrao?: number;
}) {
  const [cliente, setCliente] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [funcionario, setFuncionario] = useState(funcionarioPadrao ? String(funcionarioPadrao) : '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const clientes = useDados<Registro[]>(async () => (aberto ? comoLista(await api.clientes()) : []), [aberto]);
  const funcionarios = useDados<Registro[]>(async () => (aberto ? comoLista(await api.funcionarios()) : []), [aberto]);
  // Veículos dependem do cliente: sem ele a lista nem faz sentido.
  const veiculos = useDados<Registro[]>(
    async () => (cliente ? comoLista(await api.veiculosDoCliente(Number(cliente))) : []),
    [cliente],
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!cliente || !veiculo || !funcionario) return setErro('Selecione cliente, veículo e responsável.');

    setSalvando(true);
    try {
      await api.criarOrdem({
        idCliente: Number(cliente),
        idVeiculo: Number(veiculo),
        idFuncionario: Number(funcionario),
      });
      setCliente('');
      setVeiculo('');
      aoCriar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível abrir a ordem.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Nova ordem de serviço"
      descricao="A ordem nasce em Recebida e segue o fluxo a partir daí."
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

        <Campo
          rotulo="Veículo"
          dica={cliente && !veiculos.carregando && (veiculos.dados ?? []).length === 0
            ? 'Este cliente não tem veículo cadastrado. Cadastre um na tela de Clientes.'
            : undefined}
        >
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
            {salvando ? 'Abrindo…' : 'Abrir ordem'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
