import { useEffect, useState } from 'react';
import { aoChamar, API_BASE } from '../lib/api';
import type { Chamada } from '../lib/api';
import { IconeRede } from './Icones';

function corDoStatus(s: number) {
  if (s === 0) return '#e66767';
  if (s >= 500) return '#e66767';
  if (s === 401 || s === 403) return '#c98500';
  if (s >= 400) return '#d95926';
  return '#199e70';
}

/**
 * Inspetor de requisições.
 *
 * Existe para tornar visível o que normalmente fica escondido: toda chamada sai
 * com um X-Correlation-ID, atravessa o APIM e volta com o mesmo ID — que é o
 * mesmo valor procurável nos logs do Datadog. É a ponte entre a tela e a
 * observabilidade.
 */
export default function Inspetor() {
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => aoChamar((c) => setChamadas((cs) => [c, ...cs].slice(0, 25))), []);

  const ultima = chamadas[0];

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(26rem,calc(100vw-2rem))]">
      {aberto && (
        <div className="card mb-2 max-h-[60vh] animate-rise overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Inspetor de requisições</p>
              <p className="font-mono text-[11px] text-ink-mute">{API_BASE.replace('https://', '')}</p>
            </div>
            <button onClick={() => setAberto(false)} className="text-xs text-ink-mute hover:text-ink">
              fechar
            </button>
          </div>

          <div className="max-h-[46vh] overflow-y-auto">
            {chamadas.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-ink-mute">Nenhuma chamada ainda.</p>
            )}
            {chamadas.map((c, i) => (
              <div key={`${c.quando}-${i}`} className="border-b border-line/60 px-4 py-3 last:border-0">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                    style={{ background: `${corDoStatus(c.status)}22`, color: corDoStatus(c.status) }}
                  >
                    {c.status || 'ERR'}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-ink-soft">{c.metodo}</span>
                  <span className="truncate font-mono text-[11px] text-ink-mute">{c.caminho}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-mute">{c.ms}ms</span>
                </div>
                {c.correlationId && (
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(c.correlationId!);
                      setCopiado(c.correlationId);
                      setTimeout(() => setCopiado(null), 1600);
                    }}
                    className="mt-1.5 block w-full truncate text-left font-mono text-[10px] text-ink-mute transition-colors hover:text-brand"
                    title="Copiar o correlation ID para buscar no Datadog"
                  >
                    {copiado === c.correlationId ? '✓ copiado — busque no Datadog' : `cid ${c.correlationId}`}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setAberto((a) => !a)}
        className="card ml-auto flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold shadow-2xl transition-transform hover:scale-[1.02]"
      >
        <IconeRede className="h-4 w-4 text-brand" />
        <span>Gateway</span>
        {ultima && (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
            style={{ background: `${corDoStatus(ultima.status)}22`, color: corDoStatus(ultima.status) }}
          >
            {ultima.status || 'ERR'} · {ultima.ms}ms
          </span>
        )}
      </button>
    </div>
  );
}
