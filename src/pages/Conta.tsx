import { useState } from 'react';
import { api, ErroApi } from '../lib/api';
import { ehGerente, useAuth } from '../lib/auth';
import { Cabecalho } from '../components/Layout';
import { Aviso, Campo } from '../components/Form';

/**
 * O que o perfil de quem esta logado alcanca.
 *
 * As regras sao do servidor, e o painel apenas esconde o que terminaria em 403.
 * Sem dizer isso em algum lugar, a tela some com botoes sem explicar por que —
 * um Mecanico ve as mesmas telas do Gerente, so que sem editar nem desativar, e
 * nao tem como saber que a diferenca e o cargo.
 */
function Permissoes() {
  const { sessao } = useAuth();
  const cliente = sessao?.tipo === 'cliente';
  const gerente = ehGerente(sessao);

  const linhas = cliente
    ? [
        ['Ver os proprios veiculos e ordens', true],
        ['Aprovar ou recusar o proprio orcamento', true],
        ['Ver clientes, equipe e catalogo de pecas', false],
        ['Abrir ordem, lancar item, mover status', false],
      ]
    : [
        ['Abrir ordem e mover pelo fluxo', true],
        ['Lancar peca e mao de obra, calcular e enviar orcamento', true],
        ['Cadastrar cliente, veiculo, peca e consultar a equipe', true],
        ['Editar e desativar cliente e peca', gerente],
        ['Editar veiculo, item e reatribuir ordem', gerente],
        ['Cadastrar, editar e remover funcionario', gerente],
      ];

  return (
    <section className="card mb-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">O que este perfil pode fazer</h2>
        <span className="text-xs text-ink-mute">
          {cliente ? 'Perfil Cliente' : `Cargo ${sessao?.detalhe ?? '—'}`}
        </span>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {linhas.map(([rotulo, pode]) => (
          <li key={String(rotulo)} className="flex items-start gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold"
              style={
                pode
                  ? { background: '#199e7022', color: '#199e70' }
                  : { background: '#6b748222', color: '#6b7482' }
              }
            >
              {pode ? '\u2713' : '\u2715'}
            </span>
            <span className={pode ? '' : 'text-ink-mute'}>{rotulo}</span>
          </li>
        ))}
      </ul>

      {!cliente && !gerente && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
          Editar e desativar sao do cargo <b>Gerente</b>. Os botoes nao aparecem aqui porque a
          API recusa essas rotas para os outros cargos — a regra e do servidor, nao da tela.
        </p>
      )}
    </section>
  );
}

export default function Conta() {
  const { sessao, sair } = useAuth();

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);

    if (nova !== confirmacao) return setAviso({ tipo: 'erro', texto: 'A confirmação não confere com a nova senha.' });
    if (nova === atual) return setAviso({ tipo: 'erro', texto: 'A nova senha precisa ser diferente da atual.' });

    setSalvando(true);
    try {
      await api.alterarSenha(atual, nova, confirmacao);
      setAtual('');
      setNova('');
      setConfirmacao('');
      setAviso({
        tipo: 'ok',
        texto: 'Senha alterada. O token atual continua valendo até expirar; entre de novo para renová-lo.',
      });
    } catch (e2) {
      setAviso({ tipo: 'erro', texto: e2 instanceof ErroApi ? e2.message : 'Não foi possível alterar a senha.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Cabecalho titulo="Minha conta" descricao="Seus dados de acesso ao painel." />

      <Permissoes />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="card h-fit p-5">
          <h2 className="text-sm font-semibold">Sessão atual</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-mute">Nome</dt>
              <dd className="truncate font-medium">{sessao?.nome ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-mute">Perfil</dt>
              <dd className="font-medium">{sessao?.detalhe ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-mute">Sessão expira</dt>
              <dd className="font-medium tabular-nums">
                {sessao ? new Date(sessao.expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </dd>
            </div>
          </dl>
          <button onClick={sair} className="btn-ghost mt-5 w-full py-2 text-xs">
            Encerrar sessão
          </button>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Alterar senha</h2>
          <p className="mt-1 text-xs text-ink-mute">
            {sessao?.tipo === 'cliente'
              ? 'O acesso de cliente é só por CPF, sem senha — não há o que alterar aqui.'
              : 'A senha atual é conferida no servidor antes da troca.'}
          </p>

          {sessao?.tipo !== 'cliente' && (
            <form onSubmit={salvar} className="mt-5 max-w-md space-y-4">
              <Campo rotulo="Senha atual">
                <input
                  id="senha-atual"
                  className="field"
                  type="password"
                  autoComplete="current-password"
                  value={atual}
                  onChange={(e) => setAtual(e.target.value)}
                  required
                />
              </Campo>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Nova senha">
                  <input
                    id="senha-nova"
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    value={nova}
                    onChange={(e) => setNova(e.target.value)}
                    required
                  />
                </Campo>
                <Campo rotulo="Confirmar nova senha">
                  <input
                    id="senha-confirmacao"
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    value={confirmacao}
                    onChange={(e) => setConfirmacao(e.target.value)}
                    required
                  />
                </Campo>
              </div>

              {aviso && <Aviso tipo={aviso.tipo} texto={aviso.texto} />}

              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? 'Alterando…' : 'Alterar senha'}
              </button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
