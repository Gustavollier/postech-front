import { Link } from 'react-router-dom';
import { api, comoLista } from '../lib/api';
import { useDados } from '../lib/useDados';
import { useOrdens } from '../lib/useOrdens';
import { useRotulosOrdem } from '../lib/useCatalogos';
import { STATUS, numero, statusDaOrdem } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Distribuicao, Erro, Esqueleto, Selo, Tile, Vazio } from '../components/Base';
import { IconeAtualizar } from '../components/Icones';

export default function Painel() {
  const { dados, erro, carregando, recarregar, ehCliente } = useOrdens();
  const ordens = dados ?? [];
  const rotulo = useRotulosOrdem(ordens);

  /**
   * A distribuição vem da rota que a API já entrega ordenada por status. Para o
   * cliente ela é 403 — rota da operação —, e aí a contagem sai das ordens dele.
   */
  const agrupadas = useDados<Registro[] | null>(
    async () => (ehCliente ? null : comoLista(await api.ordensPorStatus())),
    [ehCliente],
  );

  const base = agrupadas.dados ?? ordens;
  const porStatus = STATUS.map((s) => ({
    ...s,
    valor: base.filter((o) => statusDaOrdem(o).id === s.id).length,
  }));

  const abertas = ordens.filter((o) => {
    const s = statusDaOrdem(o).id;
    return s >= 0 && s < 4;
  }).length;
  const emExecucao = porStatus.find((s) => s.id === 3)?.valor ?? 0;
  const entregues = porStatus.find((s) => s.id === 5)?.valor ?? 0;

  return (
    <>
      <Cabecalho
        titulo={ehCliente ? 'Meus veículos' : 'Painel'}
        descricao={
          ehCliente
            ? 'Acompanhe o andamento dos serviços dos seus veículos.'
            : 'Visão geral das ordens de serviço em circulação na oficina.'
        }
        acao={
          <button onClick={recarregar} className="btn-ghost px-3 py-2 text-xs" disabled={carregando}>
            <IconeAtualizar className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        }
      />

      {/* Duas colunas ja no celular: empilhados, os quatro indicadores ocupavam
          a tela inteira antes de qualquer conteudo. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Tile
          rotulo={ehCliente ? 'Minhas ordens' : 'Ordens no total'}
          valor={ordens.length}
          carregando={carregando}
          apoio={ehCliente ? 'Abertas e concluídas' : 'Registradas na base'}
        />
        <Tile rotulo="Em aberto" valor={abertas} cor="#d95926" carregando={carregando} apoio="Ainda não finalizadas" />
        <Tile rotulo="Em execução" valor={emExecucao} cor="#c98500" carregando={carregando} apoio="Mecânico trabalhando" />
        <Tile rotulo="Entregues" valor={entregues} cor="#008300" carregando={carregando} apoio="Ciclo concluído" />
      </div>

      <section className="card mt-6 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Distribuição por status</h2>
          <span className="text-xs text-ink-mute">{base.length} ordens</span>
        </div>

        {carregando ? (
          <div className="h-2.5 w-full animate-pulse rounded-full bg-raised" />
        ) : (
          <>
            <Distribuicao partes={porStatus.map((s) => ({ nome: s.nome, valor: s.valor, cor: s.cor }))} />
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {porStatus.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />
                  <span className="text-ink-soft">{s.nome}</span>
                  <span className="font-semibold tabular-nums">{s.valor}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Ordens recentes</h2>
          <Link to="/ordens" className="text-xs font-semibold text-brand hover:underline">
            ver todas
          </Link>
        </div>

        {erro && <Erro mensagem={erro} aoTentar={recarregar} />}
        {carregando && !erro && <Esqueleto linhas={4} />}

        {!carregando && !erro && ordens.length === 0 && (
          <Vazio
            titulo="Nenhuma ordem encontrada"
            descricao={
              ehCliente
                ? 'Quando a oficina abrir uma ordem para um veículo seu, ela aparece aqui.'
                : 'Quando a oficina registrar ordens, elas aparecem aqui.'
            }
          />
        )}

        <div className="space-y-2">
          {ordens.slice(0, 6).map((o, i) => {
            const id = numero(o, 'id', 'Id');
            const { id: s, cor } = statusDaOrdem(o);
            return (
              <div key={id ?? i} className="card flex flex-wrap items-center gap-3 px-4 py-3.5 transition-colors hover:border-ink-mute/40">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-mono text-xs font-bold"
                     style={{ background: `${cor}1a`, color: cor }}>
                  #{id ?? '?'}
                </div>
                <div className="min-w-[10rem] flex-1">
                  <p className="truncate text-sm font-semibold">{rotulo.titulo(o)}</p>
                  <p className="truncate text-xs text-ink-mute">
                    {ehCliente ? `Ordem #${id ?? '—'}` : `Responsável: ${rotulo.responsavel(o)}`}
                  </p>
                </div>
                <Selo status={s} />
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
