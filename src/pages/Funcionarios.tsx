import { useState } from 'react';
import { api, comoLista, ErroApi } from '../lib/api';
import { useDados } from '../lib/useDados';
import { moeda, numero, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Vazio } from '../components/Base';
import { Aviso, Campo, Modal, Selecao } from '../components/Form';
import { IconeAtualizar } from '../components/Icones';

/** Cargos, no mesmo enum da API. */
const CARGOS = [
  { id: 0, nome: 'Mecânico' },
  { id: 1, nome: 'Recepcionista' },
  { id: 2, nome: 'Gerente' },
  { id: 3, nome: 'Estoquista' },
  { id: 4, nome: 'Eletricista' },
  { id: 5, nome: 'Lavador' },
  { id: 6, nome: 'Supervisor' },
];

export default function Funcionarios() {
  const { dados, erro, carregando, recarregar } = useDados<Registro[]>(async () =>
    comoLista(await api.funcionarios()),
  );
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);

  const funcionarios = dados ?? [];

  return (
    <>
      <Cabecalho
        titulo="Equipe"
        descricao="Quem trabalha na oficina e o custo de cada hora."
        acao={
          <div className="flex gap-2">
            <button onClick={recarregar} className="btn-ghost px-3 py-2 text-xs" disabled={carregando}>
              <IconeAtualizar className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button onClick={() => setNovo(true)} className="btn-primary px-4 py-2 text-xs">
              + Novo funcionário
            </button>
          </div>
        }
      />

      {aviso && (
        <div className="mb-5">
          <Aviso tipo={aviso.tipo} texto={aviso.texto} />
        </div>
      )}

      {erro && <Erro mensagem={erro} aoTentar={recarregar} />}
      {carregando && !erro && <Esqueleto linhas={4} />}
      {!carregando && !erro && funcionarios.length === 0 && (
        <Vazio titulo="Nenhum funcionário" descricao="Cadastre o primeiro integrante da equipe." />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {funcionarios.map((f, i) => (
          <article key={String(numero(f, 'id', 'Id') ?? i)} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{texto(f, 'nome', 'Nome')}</p>
                <p className="truncate text-xs text-ink-mute">{texto(f, 'contato', 'Contato')}</p>
              </div>
              <span className="shrink-0 rounded-full bg-brand/12 px-2.5 py-1 text-[10px] font-bold uppercase text-brand">
                {texto(f, 'cargo', 'Cargo')}
              </span>
            </div>

            <dl className="mt-4 flex items-end justify-between border-t border-line pt-3">
              <dt className="text-xs text-ink-mute">Valor/hora</dt>
              <dd className="text-lg font-bold tabular-nums">{moeda(numero(f, 'valorHora', 'ValorHora'))}</dd>
            </dl>
          </article>
        ))}
      </div>

      <ModalNovoFuncionario
        aberto={novo}
        aoFechar={() => setNovo(false)}
        aoCriar={() => {
          setNovo(false);
          setAviso({ tipo: 'ok', texto: 'Funcionário cadastrado. Ele já pode entrar com o CPF e a senha definida.' });
          void recarregar();
        }}
      />
    </>
  );
}

function ModalNovoFuncionario({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [nome, setNome] = useState('');
  const [contato, setContato] = useState('');
  const [cpf, setCpf] = useState('');
  const [cargo, setCargo] = useState('0');
  const [valorHora, setValorHora] = useState('120');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha !== confirmacao) return setErro('A confirmação não confere com a senha.');

    setSalvando(true);
    try {
      await api.criarFuncionario({
        nome,
        contato,
        cpf: cpf.replace(/\D/g, ''),
        cargo: Number(cargo),
        valorHora: Number(valorHora),
        senha,
        confirmacaoSenha: confirmacao,
      });
      setNome('');
      setContato('');
      setCpf('');
      setSenha('');
      setConfirmacao('');
      aoCriar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível cadastrar o funcionário.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Novo funcionário"
      descricao="Ele passa a entrar no sistema com o CPF e a senha definida aqui."
      aberto={aberto}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome">
          <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="CPF" dica="O dígito verificador é validado no login.">
            <input
              className="field font-mono"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              inputMode="numeric"
              required
            />
          </Campo>
          <Campo rotulo="Contato">
            <input className="field" value={contato} onChange={(e) => setContato(e.target.value)} required />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Cargo">
            <Selecao
              valor={cargo}
              aoMudar={setCargo}
              opcoes={CARGOS.map((c) => ({ valor: String(c.id), rotulo: c.nome }))}
            />
          </Campo>
          <Campo rotulo="Valor/hora (R$)">
            <input
              className="field"
              type="number"
              min="0"
              value={valorHora}
              onChange={(e) => setValorHora(e.target.value)}
              required
            />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Senha">
            <input
              className="field"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </Campo>
          <Campo rotulo="Confirmar senha">
            <input
              className="field"
              type="password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              required
            />
          </Campo>
        </div>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
