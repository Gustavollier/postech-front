import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Diálogo modal.
 *
 * Fecha no Esc e no clique fora, devolve o foco ao elemento que o abriu e
 * trava a rolagem de fundo — o mínimo para não ser uma caixa que prende o
 * usuário.
 */
export function Modal({
  titulo,
  descricao,
  aberto,
  aoFechar,
  children,
}: {
  titulo: string;
  descricao?: string;
  aberto: boolean;
  aoFechar: () => void;
  children: ReactNode;
}) {
  const focoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aberto) return;

    focoAnterior.current = document.activeElement as HTMLElement | null;
    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowOriginal;
      focoAnterior.current?.focus?.();
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      {/* No celular sobe de baixo e ocupa a largura toda; no desktop é um cartão centrado. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="card max-h-[92vh] w-full animate-rise overflow-y-auto rounded-b-none sm:max-w-lg sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-panel/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-base font-bold tracking-tight">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-xs text-ink-soft">{descricao}</p>}
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            className="-mr-1 shrink-0 rounded-lg px-2 py-1 text-ink-mute transition-colors hover:bg-raised hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Campo({
  rotulo,
  children,
  dica,
}: {
  rotulo: string;
  children: ReactNode;
  dica?: string;
}) {
  return (
    <label className="block">
      <span className="label">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-[11px] text-ink-mute">{dica}</span>}
    </label>
  );
}

export function Selecao({
  valor,
  aoMudar,
  opcoes,
  vazio,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: { valor: string; rotulo: string }[];
  vazio?: string;
}) {
  return (
    <select className="field" value={valor} onChange={(e) => aoMudar(e.target.value)}>
      {vazio && <option value="">{vazio}</option>}
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

/** Faixa de mensagem: erro em vermelho, confirmação em verde. */
export function Aviso({ tipo, texto }: { tipo: 'erro' | 'ok'; texto: string }) {
  const cor = tipo === 'erro' ? '#e66767' : '#199e70';
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{ background: `${cor}14`, border: `1px solid ${cor}4d`, color: cor }}
      role={tipo === 'erro' ? 'alert' : 'status'}
    >
      {texto}
    </div>
  );
}

/**
 * Confirmação das duas ações que tiram algo da tela.
 *
 * Elas não são a mesma coisa, e a tela tratava as duas igual:
 *
 *   desativar  cliente, peça e funcionário — a API marca Ativo = 0 e toda
 *              consulta filtra Ativo = 1. O registro some das listagens e
 *              perde o acesso, mas continua no banco com o histórico.
 *   excluir    ordem e item — é DELETE de verdade. A ordem leva junto
 *              orçamento, status e itens.
 *
 * O tom carrega essa diferença: âmbar para o que é reversível na base,
 * vermelho para o que some. A frase do rodapé vem junto do tom, e não de cada
 * chamada, para as três telas não contarem a mesma regra de três jeitos.
 */
export function Confirmacao({
  titulo,
  descricao,
  tom = 'excluir',
  rotuloAcao,
  aberto,
  ocupado,
  erro,
  aoFechar,
  aoConfirmar,
}: {
  titulo: string;
  descricao: string;
  tom?: 'desativar' | 'excluir';
  rotuloAcao?: string;
  aberto: boolean;
  ocupado?: boolean;
  erro?: string | null;
  aoFechar: () => void;
  aoConfirmar: () => void;
}) {
  const desativa = tom === 'desativar';
  const cor = desativa ? '#b07203' : '#c0392f';
  const rotulo = rotuloAcao ?? (desativa ? 'Desativar' : 'Excluir');

  return (
    <Modal titulo={titulo} descricao={descricao} aberto={aberto} aoFechar={aoFechar}>
      <div className="space-y-4">
        <p
          className="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed"
          style={{ background: `${cor}14`, color: cor, boxShadow: `inset 0 0 0 1px ${cor}33` }}
        >
          {desativa
            ? 'Desativar não apaga. O cadastro e o histórico continuam no banco — some das listagens e perde o acesso, e dá para reativar direto na base.'
            : 'Isso apaga o registro de vez, e não dá para desfazer pela tela.'}
        </p>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            disabled={ocupado}
            className="btn flex-1 text-white active:scale-[.98]"
            style={{ background: cor }}
          >
            {ocupado ? 'Aplicando…' : rotulo}
          </button>
        </div>
      </div>
    </Modal>
  );
}
