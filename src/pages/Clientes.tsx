import { api, comoLista } from '../lib/api';
import { useDados } from '../lib/useDados';
import { texto } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Vazio } from '../components/Base';
import { IconeAtualizar } from '../components/Icones';

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function documento(cpf: string, cnpj: string) {
  if (cpf !== '—') return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (cnpj !== '—') return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return '—';
}

export default function Clientes() {
  const { dados, erro, carregando, recarregar } = useDados(async () => comoLista(await api.clientes()));
  const clientes = dados ?? [];

  return (
    <>
      <Cabecalho
        titulo="Clientes"
        descricao="Quem a oficina atende — pessoas físicas e frotas."
        acao={
          <button onClick={recarregar} className="btn-ghost px-3 py-2 text-xs" disabled={carregando}>
            <IconeAtualizar className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        }
      />

      {erro && <Erro mensagem={erro} aoTentar={recarregar} />}
      {carregando && !erro && <Esqueleto linhas={4} />}
      {!carregando && !erro && clientes.length === 0 && (
        <Vazio titulo="Nenhum cliente" descricao="A base não retornou clientes para este token." />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {clientes.map((c, i) => {
          const nome = texto(c, 'nomeCompleto', 'NomeCompleto', 'nome');
          const ativo = c.ativo ?? c.Ativo;
          return (
            <article key={texto(c, 'id', 'Id') + String(i)} className="card p-4 transition-colors hover:border-ink-mute/40">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/12 text-sm font-bold text-brand">
                  {iniciais(nome)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nome}</p>
                  <p className="truncate font-mono text-xs text-ink-mute">
                    {documento(texto(c, 'cpf', 'CPF'), texto(c, 'cnpj', 'CNPJ'))}
                  </p>
                </div>
                {ativo === false && (
                  <span className="rounded-full bg-[#e66767]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#e66767]">
                    inativo
                  </span>
                )}
              </div>

              <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-mute">Telefone</dt>
                  <dd className="truncate font-medium">{texto(c, 'telefone', 'Telefone')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-mute">E-mail</dt>
                  <dd className="truncate font-medium">{texto(c, 'email', 'Email')}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}
