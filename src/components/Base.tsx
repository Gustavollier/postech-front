import type { ReactNode } from 'react';
import { statusPorId } from '../lib/types';

export function Selo({ status }: { status: number }) {
  const s = statusPorId(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: `${s.cor}1f`, color: s.cor }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.cor }} />
      {s.nome}
    </span>
  );
}

export function Tile({
  rotulo,
  valor,
  apoio,
  cor = '#3987e5',
  carregando,
}: {
  rotulo: string;
  valor: ReactNode;
  apoio?: string;
  cor?: string;
  carregando?: boolean;
}) {
  return (
    <div className="card group relative overflow-hidden p-5">
      <div
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${cor}, transparent)` }}
      />
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-mute">{rotulo}</p>
      {carregando ? (
        <div className="mt-3 h-9 w-20 animate-pulse rounded-lg bg-raised" />
      ) : (
        <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{valor}</p>
      )}
      {apoio && <p className="mt-1 text-xs text-ink-soft">{apoio}</p>}
    </div>
  );
}

export function Vazio({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="text-sm font-semibold text-ink-soft">{titulo}</p>
      <p className="mt-1 max-w-sm text-xs text-ink-mute">{descricao}</p>
    </div>
  );
}

export function Erro({ mensagem, aoTentar }: { mensagem: string; aoTentar?: () => void }) {
  return (
    <div className="rounded-2xl border border-[#e66767]/30 bg-[#e66767]/5 px-5 py-4">
      <p className="text-sm font-semibold text-[#e66767]">Não foi possível carregar</p>
      <p className="mt-1 text-xs text-ink-soft">{mensagem}</p>
      {aoTentar && (
        <button onClick={aoTentar} className="btn-ghost mt-3 px-3 py-1.5 text-xs">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Esqueleto({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-panel" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

/** Barra de distribuição: uma linha, segmentos com 2px de respiro entre si. */
export function Distribuicao({ partes }: { partes: { nome: string; valor: number; cor: string }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
      {partes
        .filter((p) => p.valor > 0)
        .map((p) => (
          <div
            key={p.nome}
            className="h-full rounded-[3px] transition-all duration-500"
            style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }}
            title={`${p.nome}: ${p.valor}`}
          />
        ))}
    </div>
  );
}
