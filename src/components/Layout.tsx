import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import Inspetor from './Inspetor';
import { IconeCliente, IconeOrdem, IconePainel, IconePeca, IconeSair } from './Icones';
import type { ReactNode } from 'react';

// soEquipe marca o que o perfil de cliente não alcança. Não é enfeite: a API
// devolve 403 nessas rotas para um token de cliente, então mostrar o item seria
// oferecer um caminho que termina em erro.
const itens = [
  { para: '/', rotulo: 'Painel', Icone: IconePainel, exato: true },
  { para: '/ordens', rotulo: 'Ordens de serviço', Icone: IconeOrdem },
  { para: '/clientes', rotulo: 'Clientes', Icone: IconeCliente, soEquipe: true },
  { para: '/pecas', rotulo: 'Peças', Icone: IconePeca, soEquipe: true },
  { para: '/equipe', rotulo: 'Equipe', Icone: IconeCliente, soEquipe: true },
];

export default function Layout() {
  const { sessao, sair } = useAuth();
  const navegar = useNavigate();
  const visiveis = itens.filter((i) => !i.soEquipe || sessao?.tipo !== 'cliente');

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-panel/50 px-4 py-6 lg:flex">
        <Marca />

        <nav className="mt-8 space-y-1">
          {visiveis.map(({ para, rotulo, Icone, exato }) => (
            <NavLink
              key={para}
              to={para}
              end={exato}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand/12 text-ink' : 'text-ink-soft hover:bg-raised hover:text-ink',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icone className={`h-[18px] w-[18px] ${isActive ? 'text-brand' : ''}`} />
                  {rotulo}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-line bg-raised/60 p-3">
            <p className="truncate text-sm font-semibold">{sessao?.nome}</p>
            <p className="truncate text-xs text-ink-mute">{sessao?.detalhe}</p>
            <span className="mt-2 inline-block rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
              {sessao?.tipo === 'cliente' ? 'Cliente' : 'Equipe'}
            </span>
          </div>
          <button
            onClick={() => {
              sair();
              navegar('/entrar');
            }}
            className="btn-ghost w-full justify-start px-3 py-2 text-sm"
          >
            <IconeSair className="h-4 w-4" /> Encerrar sessão
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-fundo/80 px-4 py-3 backdrop-blur-md lg:hidden">
          <Marca compacta />
          <button onClick={sair} className="btn-ghost ml-auto px-3 py-1.5 text-xs">
            Sair
          </button>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 lg:hidden">
          {visiveis.map(({ para, rotulo, exato }) => (
            <NavLink
              key={para}
              to={para}
              end={exato}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  isActive ? 'bg-brand/15 text-brand' : 'text-ink-soft',
                ].join(' ')
              }
            >
              {rotulo}
            </NavLink>
          ))}
        </nav>

        {/* pb generoso: o botao de atividade flutua sobre o canto inferior e
            sem folga ele cobre o ultimo item da lista. */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-16 lg:pt-10">
          <Outlet />
        </main>
      </div>

      <Inspetor />
    </div>
  );
}

export function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-[#199e70] text-sm font-black text-white shadow-lg shadow-brand/25">
        M
      </div>
      {!compacta && (
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-tight">Motriz</p>
          <p className="text-[11px] text-ink-mute">Gestão de oficinas</p>
        </div>
      )}
    </div>
  );
}

export function Cabecalho({ titulo, descricao, acao }: { titulo: string; descricao: string; acao?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h1>
        <p className="mt-1 text-sm text-ink-soft">{descricao}</p>
      </div>
      {acao}
    </div>
  );
}
