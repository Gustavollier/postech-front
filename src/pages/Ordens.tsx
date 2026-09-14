import { useMemo, useState } from 'react';
import { api, ErroApi } from '../lib/api';
import { useOrdens } from '../lib/useOrdens';
import { STATUS, dataCurta, numero, statusPorId, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Selo, Vazio } from '../components/Base';
import { IconeAtualizar } from '../components/Icones';
import { useAuth } from '../lib/auth';

export default function Ordens() {
  const { sessao } = useAuth();
  const { dados, erro, carregando, recarregar, ehCliente } = useOrdens();
  const [filtro, setFiltro] = useState<number | 'todos'>('todos');
  const [busca, setBusca] = useState('');
  const [mudando, setMudando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ordens = dados ?? [];

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ordens.filter((o) => {
      const s = numero(o, 'status', 'Status');
      if (filtro !== 'todos' && s !== filtro) return false;
      if (!q) return true;
      return JSON.stringify(o).toLowerCase().includes(q);
    });
  }, [ordens, filtro, busca]);

  async function avancar(o: Registro) {
    const id = numero(o, 'id', 'Id');
    const s = numero(o, 'status', 'Status');
    if (id === null || s === null || s >= 5) return;

    // O backend registra quem moveu a ordem; num token de cliente não há
    // funcionário, então caímos no gerente do seed para a demonstração.
    const idFuncionario = 1;
    setMudando(id);
    setAviso(null);
    try {
      await api.atualizarStatus(id, idFuncionario, s + 1);
      await recarregar();
    } catch (e) {
      setAviso(e instanceof ErroApi ? e.message : 'Não foi possível avançar o status.');
    } finally {
      setMudando(null);
    }
  }

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
          <button onClick={recarregar} className="btn-ghost px-3 py-2 text-xs" disabled={carregando}>
            <IconeAtualizar className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        }
      />

      <div className="mb-5 space-y-3">
        <input
          className="field h-11 w-full py-2 sm:max-w-md"
          placeholder="Buscar por cliente, veículo, id…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip ativo={filtro === 'todos'} onClick={() => setFiltro('todos')} rotulo={`Todas (${ordens.length})`} />
          {STATUS.map((s) => {
            const n = ordens.filter((o) => numero(o, 'status', 'Status') === s.id).length;
            if (n === 0) return null;
            return (
              <Chip key={s.id} ativo={filtro === s.id} onClick={() => setFiltro(s.id)} rotulo={`${s.nome} (${n})`} cor={s.cor} />
            );
          })}
        </div>
      </div>

      {aviso && (
        <div className="mb-4 rounded-xl border border-[#c98500]/30 bg-[#c98500]/8 px-4 py-3 text-sm text-[#c98500]">
          {aviso}
          {sessao?.tipo === 'cliente' && (
            <span className="mt-1 block text-xs text-ink-soft">
              Movimentar ordens é operação de funcionário — entre com o perfil de funcionário para executá-la.
            </span>
          )}
        </div>
      )}

      {erro && <Erro mensagem={erro} aoTentar={recarregar} />}
      {carregando && !erro && <Esqueleto linhas={6} />}

      {!carregando && !erro && visiveis.length === 0 && (
        <Vazio
          titulo="Nada por aqui"
          descricao={busca || filtro !== 'todos' ? 'Nenhuma ordem bate com o filtro atual.' : 'Ainda não há ordens registradas.'}
        />
      )}

      <div className="space-y-2.5">
        {visiveis.map((o, i) => {
          const id = numero(o, 'id', 'Id');
          const s = numero(o, 'status', 'Status') ?? 0;
          const cor = statusPorId(s).cor;
          const proximo = s < 5 ? statusPorId(s + 1).nome : null;

          return (
            <article
              key={id ?? i}
              className="card overflow-hidden transition-colors hover:border-ink-mute/40"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <div className="flex flex-wrap items-center gap-4 px-4 py-4">
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-mono text-sm font-bold"
                  style={{ background: `${cor}1a`, color: cor }}
                >
                  #{id ?? '?'}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    Cliente {texto(o, 'idCliente', 'clienteId')} · Veículo {texto(o, 'idVeiculo', 'veiculoId')}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-mute">
                    Responsável {texto(o, 'idFuncionario', 'funcionarioId')} · criada em{' '}
                    {dataCurta(texto(o, 'criadoEm', 'CriadoEm', 'createdAt'))}
                  </p>
                </div>

                <Selo status={s} />

                {proximo && !ehCliente && (
                  <button
                    onClick={() => avancar(o)}
                    disabled={mudando === id}
                    className="btn-ghost px-3 py-1.5 text-xs"
                    title={`Mover para ${proximo}`}
                  >
                    {mudando === id ? 'Movendo…' : `→ ${proximo}`}
                  </button>
                )}
              </div>

              {/* Trilha do fluxo: mostra onde a ordem está sem precisar ler texto. */}
              <div className="flex gap-[2px] px-4 pb-3">
                {STATUS.map((st) => (
                  <div
                    key={st.id}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{ background: st.id <= s ? st.cor : '#232935' }}
                    title={st.nome}
                  />
                ))}
              </div>
            </article>
          );
        })}
      </div>
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
