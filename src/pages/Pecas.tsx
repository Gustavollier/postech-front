import { api, comoLista } from '../lib/api';
import { useDados } from '../lib/useDados';
import { moeda, numero, texto } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Vazio } from '../components/Base';
import { IconeAtualizar } from '../components/Icones';

/** Estoque baixo é uma condição de atenção — cor de status, com rótulo junto. */
function nivel(qtd: number | null) {
  if (qtd === null) return { rotulo: '—', cor: '#6b7482' };
  if (qtd === 0) return { rotulo: 'sem estoque', cor: '#e66767' };
  if (qtd <= 10) return { rotulo: 'estoque baixo', cor: '#c98500' };
  return { rotulo: 'em estoque', cor: '#199e70' };
}

export default function Pecas() {
  const { dados, erro, carregando, recarregar } = useDados(async () => comoLista(await api.pecas()));
  const pecas = dados ?? [];

  return (
    <>
      <Cabecalho
        titulo="Peças e insumos"
        descricao="Catálogo e disponibilidade em estoque."
        acao={
          <button onClick={recarregar} className="btn-ghost px-3 py-2 text-xs" disabled={carregando}>
            <IconeAtualizar className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        }
      />

      {erro && <Erro mensagem={erro} aoTentar={recarregar} />}
      {carregando && !erro && <Esqueleto linhas={4} />}
      {!carregando && !erro && pecas.length === 0 && (
        <Vazio titulo="Catálogo vazio" descricao="Nenhuma peça retornada pela API." />
      )}

      {pecas.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-mute">
                  <th className="px-4 py-3 font-semibold">Peça</th>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 text-right font-semibold">Preço</th>
                  <th className="px-4 py-3 text-right font-semibold">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {pecas.map((p, i) => {
                  const qtd = numero(p, 'quantidadeEstoque', 'QuantidadeEstoque');
                  const n = nivel(qtd);
                  return (
                    <tr key={texto(p, 'id', 'Id') + String(i)} className="border-b border-line/50 last:border-0 hover:bg-raised/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{texto(p, 'nome', 'Nome')}</p>
                        <p className="text-xs text-ink-mute">{texto(p, 'marca', 'Marca')}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-soft">{texto(p, 'codigo', 'Codigo')}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {moeda(numero(p, 'preco', 'Preco'))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-semibold tabular-nums">{qtd ?? '—'}</span>
                          <span
                            className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                            style={{ background: `${n.cor}1f`, color: n.cor }}
                          >
                            {n.rotulo}
                          </span>
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
    </>
  );
}
